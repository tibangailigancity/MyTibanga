import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import {
    buildNamedStorageKey,
    isLegacyPublicPath,
    removeStorageObject,
    uploadStorageObject,
} from '@/lib/supabaseStorage';

/** Dev-only: save to public/documents or public/images when Supabase Storage is unreachable. */
async function uploadDocumentFile(storageKey, file) {
    try {
        return await uploadStorageObject(storageKey, file);
    } catch (err) {
        if (process.env.NODE_ENV !== 'development') throw err;
        const key = String(storageKey || '');
        const folder = key.startsWith('images/') ? 'images' : 'documents';
        const fileName = path.basename(key) || `upload-${Date.now()}`;
        const publicDir = path.join(process.cwd(), 'public', folder);
        await fs.mkdir(publicDir, { recursive: true });
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(path.join(publicDir, fileName), buffer);
        return `/${folder}/${fileName}`;
    }
}

function serializeId(id) {
    if (id == null) return id;
    return typeof id === 'bigint' ? id.toString() : String(id);
}

/** List/detail shape: DB only — signed URLs via /api/admin/documents/file */
function toListItem(d) {
    const id = serializeId(d.id);
    return {
        id,
        name: d.name,
        preview: d.preview ? `/api/admin/documents/file?id=${encodeURIComponent(id)}&kind=preview` : '',
        file: `/api/admin/documents/file?id=${encodeURIComponent(id)}&kind=file`,
        dateModified: d.date_modified,
        dateUploaded: d.date_uploaded,
        requiresPurpose: d.requires_purpose === true,
    };
}

// GET — list all documents (admin only; residents use GET /api/documents)
export async function GET() {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { rows } = await query('SELECT * FROM documents ORDER BY id DESC');
        const documents = rows.map((row) => toListItem(row));
        return NextResponse.json({ documents });
    } catch (err) {
        console.error('[documents GET]', err);
        return NextResponse.json(
            { error: err.message || 'Failed to load documents', documents: [] },
            { status: 500 }
        );
    }
}

// POST — upload a new document
export async function POST(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const previewImage = formData.get('preview');
        const name = formData.get('name') || file?.name || 'Untitled';
        const requiresPurpose = formData.get('requiresPurpose') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const id = Date.now();
        const mainKey = buildNamedStorageKey('documents', name, file.name, id);
        const mainPath = await uploadDocumentFile(mainKey, file);

        let previewKey = '';
        if (previewImage && previewImage.size > 0) {
            const previewStorageKey = buildNamedStorageKey('images', `${name}-preview`, previewImage.name, id);
            previewKey = await uploadDocumentFile(previewStorageKey, previewImage);
        }

        const now = new Date().toISOString();
        const { rows } = await query(
            'INSERT INTO documents (id, name, preview, file, date_modified, date_uploaded, requires_purpose) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [id, name, previewKey, mainPath, now, now, requiresPurpose]
        );

        return NextResponse.json({ success: true, document: toListItem(rows[0]) });
    } catch (err) {
        const msg = String(err.message || err);
        let hint = msg;
        if (/relation "documents" does not exist/i.test(msg)) {
            hint = 'Documents table is missing. Run frontend/db/schema.sql on your database.';
        } else if (/requires_purpose/i.test(msg)) {
            hint = 'Missing requires_purpose column. Run frontend/db/add_document_requires_purpose.sql.';
        } else if (/bucket|not found|fetch failed|SUPABASE/i.test(msg)) {
            hint = `${msg} — Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and create a Storage bucket named "${process.env.SUPABASE_STORAGE_BUCKET || 'documents'}".`;
        }
        console.error('[documents POST]', err);
        return NextResponse.json({ error: 'Upload failed: ' + hint }, { status: 500 });
    }
}

// DELETE — remove a document by id
export async function DELETE(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { id } = await request.json();
        const { rows } = await query('SELECT * FROM documents WHERE id = $1', [id]);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        const doc = rows[0];

        try {
            if (doc.file && !isLegacyPublicPath(doc.file)) {
                await removeStorageObject(doc.file);
            }
            if (doc.preview && !isLegacyPublicPath(doc.preview)) {
                await removeStorageObject(doc.preview);
            }
        } catch (storageErr) {
            console.error('[documents DELETE] storage remove warning:', storageErr?.message || storageErr);
        }

        await query('DELETE FROM documents WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: 'Delete failed: ' + err.message }, { status: 500 });
    }
}

// PATCH — replace file and/or update metadata (requiresPurpose)
export async function PATCH(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        try {
            const { id, requiresPurpose } = await request.json();
            if (!id) {
                return NextResponse.json({ error: 'ID is required' }, { status: 400 });
            }
            const { rows } = await query('SELECT * FROM documents WHERE id = $1', [id]);
            if (rows.length === 0) {
                return NextResponse.json({ error: 'Document not found' }, { status: 404 });
            }
            const now = new Date().toISOString();
            const { rows: updated } = await query(
                'UPDATE documents SET requires_purpose = $1, date_modified = $2 WHERE id = $3 RETURNING *',
                [requiresPurpose === true, now, id]
            );
            return NextResponse.json({ success: true, document: toListItem(updated[0]) });
        } catch (err) {
            return NextResponse.json({ error: 'Update failed: ' + err.message }, { status: 500 });
        }
    }

    try {
        const formData = await request.formData();
        const id = Number(formData.get('id'));
        const file = formData.get('file');

        if (!id || !file) {
            return NextResponse.json({ error: 'ID and file are required' }, { status: 400 });
        }

        const { rows } = await query('SELECT * FROM documents WHERE id = $1', [id]);
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        const doc = rows[0];

        try {
            if (doc.file && !isLegacyPublicPath(doc.file)) {
                await removeStorageObject(doc.file);
            }
        } catch (storageErr) {
            console.error('[documents PATCH] storage remove warning:', storageErr?.message || storageErr);
        }

        const nextFileKey = buildNamedStorageKey('documents', doc.name, file.name, id);
        const nextFilePath = await uploadDocumentFile(nextFileKey, file);

        const now = new Date().toISOString();
        const { rows: updated } = await query(
            'UPDATE documents SET file = $1, date_modified = $2 WHERE id = $3 RETURNING *',
            [nextFilePath, now, id]
        );

        return NextResponse.json({ success: true, document: toListItem(updated[0]) });
    } catch (err) {
        return NextResponse.json({ error: 'Update failed: ' + err.message }, { status: 500 });
    }
}
