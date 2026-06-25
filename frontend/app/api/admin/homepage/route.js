import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import defaultHomepageContent from '@/data/homepage.json';

// GET — public, returns homepage content
export async function GET() {
    try {
        const { rows } = await query("SELECT value FROM homepage WHERE key = 'content'");
        if (rows.length > 0) {
            return NextResponse.json(rows[0].value);
        }
    } catch (err) {
        console.error('Failed to load homepage content:', err);
    }

    return NextResponse.json(defaultHomepageContent);
}

// PATCH — admin only, update homepage content
export async function PATCH(request) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Validate structure
        if (!body.welcome || !body.about || !body.services) {
            return NextResponse.json({ error: 'Invalid data structure' }, { status: 400 });
        }

        await query(
            "INSERT INTO homepage (key, value) VALUES ('content', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(body)]
        );
        return NextResponse.json({ success: true, data: body });
    } catch (err) {
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}
