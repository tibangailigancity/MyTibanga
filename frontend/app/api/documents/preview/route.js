import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { fetchPreviewImage } from '@/lib/supabaseStorage';

/** Serve preview image bytes (Storage images/ folder, then public/images/). */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    try {
        const { rows } = await query('SELECT preview, name FROM documents WHERE id = $1', [id]);
        if (rows.length === 0 || !rows[0].preview) {
            return NextResponse.json({ error: 'Preview not found' }, { status: 404 });
        }

        const image = await fetchPreviewImage(rows[0].preview, rows[0].name);
        if (!image) {
            console.error('[documents/preview GET] not found', {
                id,
                preview: rows[0].preview,
                name: rows[0].name,
            });
            return NextResponse.json({ error: 'Could not load preview' }, { status: 404 });
        }

        return new NextResponse(image.body, {
            headers: {
                'Content-Type': image.contentType,
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (err) {
        console.error('[documents/preview GET]', err);
        return NextResponse.json({ error: err.message || 'Failed to load preview' }, { status: 500 });
    }
}
