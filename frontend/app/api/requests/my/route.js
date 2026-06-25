import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';

// GET — return requests for the currently logged-in user
export async function GET() {
    try {
        await purgeExpiredPendingRequests();
        await query(
            'ALTER TABLE requests ADD COLUMN IF NOT EXISTS resident_hidden_at TIMESTAMPTZ DEFAULT NULL'
        );
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ requests: [] });
        }

        const userId =
            session.id != null && session.id !== '' ? Number(session.id) : null;
        const userName = session.name || '';

        let requests;
        if (Number.isFinite(userId)) {
            const { rows } = await query(
                `SELECT * FROM requests
                 WHERE (user_id = $1 OR (user_id IS NULL AND resident_name = $2))
                   AND resident_hidden_at IS NULL
                 ORDER BY date DESC`,
                [userId, userName]
            );
            requests = rows;
        } else if (userName) {
            const { rows } = await query(
                `SELECT * FROM requests
                 WHERE resident_name = $1
                   AND resident_hidden_at IS NULL
                 ORDER BY date DESC`,
                [userName]
            );
            requests = rows;
        } else {
            return NextResponse.json({ requests: [] });
        }

        const requestIds = requests.map((r) => r.id);
        const docsByRequestId = new Map();
        if (requestIds.length > 0) {
            const { rows: docRows } = await query(
                'SELECT request_id, name, quantity FROM request_documents WHERE request_id = ANY($1::bigint[])',
                [requestIds]
            );
            for (const d of docRows) {
                if (!docsByRequestId.has(d.request_id)) docsByRequestId.set(d.request_id, []);
                docsByRequestId.get(d.request_id).push(d);
            }
        }

        const result = requests.map((r) => ({
            requestNo: r.request_no,
            date: r.date,
            status: r.status,
            expiredAt: r.expired_at || null,
            orNumber: r.or_number || '',
            adminNotes: r.admin_notes || '',
            documents: (docsByRequestId.get(r.id) || []).map((d) => ({
                name: d.name,
                quantity: d.quantity,
            })),
        }));

        return NextResponse.json({ requests: result });
    } catch (err) {
        return NextResponse.json({ error: err.message, requests: [] }, { status: 500 });
    }
}

// DELETE — hide own expired request from resident tracker (admin record kept until retention purge)
export async function DELETE(request) {
    try {
        await query(
            'ALTER TABLE requests ADD COLUMN IF NOT EXISTS resident_hidden_at TIMESTAMPTZ DEFAULT NULL'
        );
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const requestNo = String(body?.requestNo || '').trim();
        if (!requestNo) {
            return NextResponse.json({ error: 'Request number is required' }, { status: 400 });
        }

        const userId =
            session.id != null && session.id !== '' ? Number(session.id) : null;
        const userName = String(session.name || '').trim();

        let rows;
        if (Number.isFinite(userId)) {
            ({ rows } = await query(
                `SELECT id
                 FROM requests
                 WHERE request_no = $1
                   AND status = 'expired'
                   AND resident_hidden_at IS NULL
                   AND (user_id = $2 OR (user_id IS NULL AND resident_name = $3))
                 LIMIT 1`,
                [requestNo, userId, userName]
            ));
        } else if (userName) {
            ({ rows } = await query(
                `SELECT id
                 FROM requests
                 WHERE request_no = $1
                   AND status = 'expired'
                   AND resident_hidden_at IS NULL
                   AND resident_name = $2
                 LIMIT 1`,
                [requestNo, userName]
            ));
        } else {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!rows?.length) {
            return NextResponse.json({ error: 'Expired request not found' }, { status: 404 });
        }

        await query(
            `UPDATE requests
             SET resident_hidden_at = COALESCE(resident_hidden_at, NOW())
             WHERE id = $1`,
            [rows[0].id]
        );
        return NextResponse.json({ success: true, requestNo });
    } catch (err) {
        return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
    }
}

