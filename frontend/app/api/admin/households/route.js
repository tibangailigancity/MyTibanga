import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// GET — return distinct household names for suggestions
export async function GET() {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { rows } = await query(
            `SELECT household, COUNT(*)::int AS member_count
             FROM residents
             WHERE COALESCE(TRIM(household), '') <> ''
               AND deleted_at IS NULL
             GROUP BY household
             ORDER BY household`
        );

        const households = rows.map((r) => ({
            name: r.household,
            memberCount: r.member_count,
        }));

        return NextResponse.json({ households });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
