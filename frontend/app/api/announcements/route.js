import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/** Public read-only list for the home page banner (newest first). */
export async function GET() {
    try {
        const { rows } = await query(
            'SELECT title, content FROM announcements ORDER BY id DESC'
        );
        const announcements = rows
            .map((r) => {
                const title = (r.title || '').trim();
                const content = (r.content || '').trim();
                if (title && content) return `${title} — ${content}`;
                return title || content || '';
            })
            .filter(Boolean);
        return NextResponse.json({ announcements });
    } catch {
        return NextResponse.json({ announcements: [] });
    }
}
