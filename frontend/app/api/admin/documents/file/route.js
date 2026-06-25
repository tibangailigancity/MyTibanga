import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import {
    createSignedStorageUrl,
    fetchPreviewImage,
    isLegacyPublicPath,
    normalizeStorageKey,
} from '@/lib/supabaseStorage';

/** Stream or redirect document/preview files (admin only). */
export async function GET(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const kind = searchParams.get('kind') === 'preview' ? 'preview' : 'file';

    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    try {
        const { rows } = await query('SELECT preview, file, name FROM documents WHERE id = $1', [id]);
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        const path = kind === 'preview' ? rows[0].preview : rows[0].file;
        if (!path) {
            return NextResponse.json({ error: 'File not available' }, { status: 404 });
        }

        if (kind === 'preview') {
            const image = await fetchPreviewImage(path, rows[0].name);
            if (!image) {
                return NextResponse.json({ error: 'Preview not available' }, { status: 404 });
            }
            return new NextResponse(image.body, {
                headers: {
                    'Content-Type': image.contentType,
                    'Cache-Control': 'private, max-age=300',
                },
            });
        }

        if (isLegacyPublicPath(path)) {
            return NextResponse.redirect(new URL(path, request.url));
        }

        const key = normalizeStorageKey(path);
        const signedUrl = await createSignedStorageUrl(key);
        if (!signedUrl) {
            return NextResponse.json({ error: 'Could not create download URL' }, { status: 502 });
        }
        return NextResponse.redirect(signedUrl);
    } catch (err) {
        console.error('[documents/file GET]', err);
        return NextResponse.json(
            { error: err.message || 'Failed to open file' },
            { status: 500 }
        );
    }
}
