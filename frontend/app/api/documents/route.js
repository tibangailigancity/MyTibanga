import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

function serializeId(id) {
    if (id == null) return id;
    return typeof id === 'bigint' ? id.toString() : String(id);
}

/**
 * Public catalog for residents (document request page).
 * Previews load via /api/documents/preview (Storage images/ folder, then public/).
 */
export async function GET() {
    try {
        const { rows } = await query(
            'SELECT id, name, preview, requires_purpose FROM documents ORDER BY id DESC'
        );
        const documents = rows.map((d) => {
            const id = serializeId(d.id);
            return {
                id,
                name: d.name,
                preview: d.preview
                    ? `/api/documents/preview?id=${encodeURIComponent(id)}`
                    : '',
                requiresPurpose: d.requires_purpose === true,
            };
        });
        return NextResponse.json({ documents });
    } catch (err) {
        console.error('[documents GET]', err);
        return NextResponse.json(
            { error: err.message || 'Failed to load documents', documents: [] },
            { status: 500 }
        );
    }
}
