import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// POST — restore a previously soft-deleted resident
export async function POST(request, { params }) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const residentId = parseInt(id, 10);
    if (Number.isNaN(residentId)) {
        return NextResponse.json({ error: 'Invalid resident id' }, { status: 400 });
    }

    const { rows, rowCount } = await query(
        'UPDATE residents SET deleted_at = NULL, archive_reason = \'\' WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *',
        [residentId]
    );

    if (rowCount === 0) {
        return NextResponse.json({ error: 'Resident not found or not deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true, resident: rows[0] });
}
