import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// DELETE — permanently remove a soft-deleted resident and linked resident login.
export async function DELETE(request, { params }) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const residentId = parseInt(id, 10);
    if (Number.isNaN(residentId)) {
        return NextResponse.json({ error: 'Invalid resident id' }, { status: 400 });
    }

    const { rows: residentRows } = await query(
        `SELECT id, username, email, deleted_at
         FROM residents
         WHERE id = $1`,
        [residentId]
    );
    const resident = residentRows[0];
    if (!resident) {
        return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
    }
    if (!resident.deleted_at) {
        return NextResponse.json(
            { error: 'Resident must be archived before permanent delete' },
            { status: 400 }
        );
    }

    let linkedLoginRemoved = false;
    const username = String(resident.username || '').trim();
    const email = String(resident.email || '').trim();

    if (username) {
        const del = await query(
            `DELETE FROM users
             WHERE role = 'resident'
               AND super_admin IS NOT TRUE
               AND LOWER(username) = LOWER($1)`,
            [username]
        );
        linkedLoginRemoved = del.rowCount > 0;
    } else if (email) {
        const { rows: matches } = await query(
            `SELECT id FROM users
             WHERE role = 'resident'
               AND super_admin IS NOT TRUE
               AND LOWER(TRIM(email)) = LOWER($1)`,
            [email]
        );
        if (matches.length === 1) {
            const del = await query('DELETE FROM users WHERE id = $1', [matches[0].id]);
            linkedLoginRemoved = del.rowCount > 0;
        }
    }

    const { rowCount } = await query('DELETE FROM residents WHERE id = $1', [residentId]);
    if (rowCount === 0) {
        return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, hardDeleted: true, linkedLoginRemoved });
}
