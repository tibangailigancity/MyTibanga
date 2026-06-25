import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';

// GET — look up a request by request number (public endpoint)
// Usage: /api/requests/track?requestNo=032426145453
export async function GET(request) {
    try {
        await purgeExpiredPendingRequests();
        const { searchParams } = new URL(request.url);
        const requestNo = searchParams.get('requestNo');

        if (!requestNo) {
            return NextResponse.json({ error: 'Request number is required' }, { status: 400 });
        }

        const { rows } = await query(
            'SELECT * FROM requests WHERE request_no = $1 LIMIT 1',
            [requestNo]
        );

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        const r = rows[0];
        const { rows: docs } = await query(
            'SELECT * FROM request_documents WHERE request_id = $1',
            [r.id]
        );

        return NextResponse.json({
            request: {
                requestNo: r.request_no,
                residentName: r.resident_name,
                totalAmount: parseFloat(r.total_amount),
                date: r.date,
                status: r.status,
                expiredAt: r.expired_at || null,
                paymentMethod: r.payment_method,
                referenceNo: r.reference_no,
                orNumber: r.or_number || '',
                rejectionReason: r.rejection_reason,
                adminNotes: r.admin_notes || '',
                purpose: r.purpose || '',
                documents: docs.map(d => ({
                    name: d.name,
                    quantity: d.quantity,
                    unitPrice: parseFloat(d.unit_price),
                    total: parseFloat(d.total),
                })),
            },
        });
    } catch (err) {
        return NextResponse.json({ error: 'Failed to look up request: ' + err.message }, { status: 500 });
    }
}
