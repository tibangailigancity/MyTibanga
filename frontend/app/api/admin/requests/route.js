import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin, requireAuth } from '@/lib/auth';
import { priceLineItems } from '@/lib/documentFeeResolve';
import { sendSMS, isPhilippineMobileSmsCapable } from '@/lib/sms';
import { buildDocumentRequestSubmittedSms } from '@/lib/documentRequirements';
import { loadDocumentRequirementsMap } from '@/lib/documentRequirementsServer';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';
import {
    loadOrBooklet,
    OrBookletError,
    orBookletSummary,
    resolveOrForStatusUpdate,
} from '@/lib/orBooklet';

// Helper: convert DB row to camelCase for frontend
function toCamel(r, docs = []) {
    return {
        id: r.id,
        requestNo: r.request_no,
        residentName: r.resident_name,
        userId: r.user_id != null ? r.user_id : null,
        totalAmount: parseFloat(r.total_amount),
        date: r.date,
        status: r.status,
        paymentMethod: r.payment_method,
        referenceNo: r.reference_no,
        orNumber: r.or_number || '',
        expiredAt: r.expired_at || null,
        rejectionReason: r.rejection_reason,
        adminNotes: r.admin_notes || '',
        purpose: r.purpose || '',
        documents: docs.map(d => ({
            name: d.name,
            quantity: d.quantity,
            unitPrice: parseFloat(d.unit_price),
            total: parseFloat(d.total),
        })),
    };
}

// GET — list all requests (admin only)
export async function GET() {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;
    await purgeExpiredPendingRequests();

    // Load requests + their line items in one round-trip to reduce latency on hosted DBs.
    const { rows } = await query(
        `SELECT
            r.*,
            d.id AS doc_id,
            d.name AS doc_name,
            d.quantity AS doc_quantity,
            d.unit_price AS doc_unit_price,
            d.total AS doc_total
         FROM requests r
         LEFT JOIN request_documents d ON d.request_id = r.id
         ORDER BY r.id DESC, d.id ASC`
    );

    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.id)) {
            grouped.set(row.id, { request: row, docs: [] });
        }
        if (row.doc_id != null) {
            grouped.get(row.id).docs.push({
                id: row.doc_id,
                name: row.doc_name,
                quantity: row.doc_quantity,
                unit_price: row.doc_unit_price,
                total: row.doc_total,
            });
        }
    }
    const result = Array.from(grouped.values()).map(({ request, docs }) => toCamel(request, docs));
    const orBooklet = orBookletSummary(await loadOrBooklet());
    return NextResponse.json({ requests: result, orBooklet });
}

// POST — create a new request (logged-in resident or admin; session sets user_id)
export async function POST(request) {
    try {
        const gate = await requireAuth();
        if (!gate.ok) return gate.response;

        const body = await request.json();
        const { residentName, documents, paymentMethod, referenceNo, requestNo, purpose } = body;
        const purposeText = String(purpose || '').trim().replace(/\s+/g, ' ');
        if (purposeText.length < 3) {
            return NextResponse.json(
                { error: 'Please enter the purpose of your request (at least 3 characters).' },
                { status: 400 }
            );
        }
        if (purposeText.length > 250) {
            return NextResponse.json(
                { error: 'Purpose must be 250 characters or less.' },
                { status: 400 }
            );
        }

        if (!documents || documents.length === 0) {
            return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
        }

        const session = gate.session;
        const userId =
            session?.id != null && session.id !== ''
                ? Number(session.id)
                : null;
        const userIdForDb = Number.isFinite(userId) ? userId : null;

        const { rows: feeRows } = await query("SELECT value FROM settings WHERE key = 'documentFees'");
        const documentFees = Array.isArray(feeRows[0]?.value) ? feeRows[0].value : [];
        const priced = priceLineItems(documentFees, documents);
        const totalAmount = priced.reduce((sum, doc) => sum + doc.total, 0);

        const { rows: paymentRows } = await query("SELECT value FROM settings WHERE key = 'paymentConfig'");
        const onlinePaymentEnabled = paymentRows[0]?.value?.onlinePaymentEnabled !== false;
        const method = String(paymentMethod || 'cash').toLowerCase();
        if (!onlinePaymentEnabled && (method === 'gcash' || method === 'bank')) {
            return NextResponse.json(
                { error: 'Online payment is not available. Please use cash.' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();
        const id = Date.now();

        // Insert request (user_id from session cookie, not request body)
        const { rows } = await query(
            `INSERT INTO requests (id, request_no, resident_name, user_id, total_amount, date, status, payment_method, reference_no, purpose)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [
                id,
                requestNo || String(id),
                residentName || 'Unknown',
                userIdForDb,
                totalAmount,
                now,
                'pending',
                paymentMethod || 'cash',
                referenceNo || '',
                purposeText,
            ]
        );

        const docRows = [];
        for (const doc of priced) {
            const { rows: dRows } = await query(
                'INSERT INTO request_documents (request_id, name, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5) RETURNING *',
                [id, doc.name, doc.quantity, doc.unitPrice, doc.total]
            );
            docRows.push(dRows[0]);
        }

        // Trigger SMS in background; do not delay API response for slow provider calls.
        if (userIdForDb) {
            try {
                const { rows: userRows } = await query(
                    'SELECT id, name, username, email, mobile_number FROM users WHERE id = $1',
                    [userIdForDb]
                );
                const userRow = userRows[0];
                let phone = userRow?.mobile_number;

                // Fallback: some older resident accounts have mobile only in residents table.
                if (!phone && userRow) {
                    const { rows: residentRows } = await query(
                        `SELECT mobile_number
                         FROM residents
                         WHERE deleted_at IS NULL
                           AND (
                               username = $1
                               OR LOWER(TRIM(email)) = LOWER($2)
                               OR LOWER(TRIM(first_name || ' ' || last_name)) = LOWER($3)
                           )
                         ORDER BY id DESC
                         LIMIT 1`,
                        [
                            String(userRow.username || '').trim(),
                            String(userRow.email || '').trim(),
                            String(userRow.name || '').trim(),
                        ]
                    );
                    phone = residentRows[0]?.mobile_number || '';
                }
                console.log('[SMS] user_id:', userIdForDb, 'phone:', phone);
                if (phone) {
                    const reqNo = requestNo || id;
                    const requirementsMap = await loadDocumentRequirementsMap();
                    const msg = buildDocumentRequestSubmittedSms(reqNo, priced, requirementsMap);
                    if (isPhilippineMobileSmsCapable(phone)) {
                        sendSMS(phone, msg)
                            .then((smsResult) => {
                                console.log(`[SMS] req_no:${reqNo} result:`, JSON.stringify(smsResult));
                            })
                            .catch((smsErr) => {
                                console.error(`[SMS] req_no:${reqNo} async error:`, smsErr?.message || smsErr);
                            });
                    } else {
                        console.log(`[SMS] req_no:${reqNo} skipped (landline or non-mobile number — SMS only works for 09… / +639… mobiles):`, phone);
                    }
                }
            } catch (smsErr) { console.error('[SMS] error:', smsErr.message); }
        }

        return NextResponse.json({ success: true, request: toCamel(rows[0], docRows) });
    } catch (err) {
        return NextResponse.json({ error: 'Failed to create request: ' + err.message }, { status: 500 });
    }
}

// PATCH — update request status and/or admin notes (admin only)
export async function PATCH(request) {
    try {
        const gate = await requireAdmin();
        if (!gate.ok) return gate.response;

        const { id, status, rejectionReason, adminNotes, orNumber, purpose } = await request.json();

        // Partial update: admin notes and/or OR (no status change)
        if (!status) {
            const sets = [];
            const vals = [];
            let p = 1;
            if (adminNotes !== undefined) {
                sets.push(`admin_notes = $${p++}`);
                vals.push(adminNotes);
            }
            if (orNumber !== undefined) {
                sets.push(`or_number = $${p++}`);
                vals.push(String(orNumber).trim());
            }
            if (purpose !== undefined) {
                const { rows: currentRows } = await query('SELECT status FROM requests WHERE id = $1 LIMIT 1', [id]);
                if (!currentRows[0]) {
                    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
                }
                if (String(currentRows[0].status || '').toLowerCase() !== 'pending') {
                    return NextResponse.json(
                        { error: 'Purpose can only be edited while request is pending.' },
                        { status: 400 }
                    );
                }
                const purposeText = String(purpose).trim().replace(/\s+/g, ' ');
                if (purposeText.length < 3) {
                    return NextResponse.json(
                        { error: 'Purpose must be at least 3 characters.' },
                        { status: 400 }
                    );
                }
                if (purposeText.length > 250) {
                    return NextResponse.json(
                        { error: 'Purpose must be 250 characters or less.' },
                        { status: 400 }
                    );
                }
                sets.push(`purpose = $${p++}`);
                vals.push(purposeText);
            }
            if (sets.length === 0) {
                return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
            }
            vals.push(id);
            const result = await query(
                `UPDATE requests SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
                vals
            );
            if (result.rowCount === 0) {
                return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            }
            const { rows: docs } = await query('SELECT * FROM request_documents WHERE request_id = $1', [id]);
            return NextResponse.json({ success: true, request: toCamel(result.rows[0], docs) });
        }

        const validStatuses = ['pending', 'approved', 'for_release', 'completed'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        const { rows: beforeRows } = await query(
            'SELECT or_number FROM requests WHERE id = $1 LIMIT 1',
            [id]
        );
        if (!beforeRows[0]) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        let resolvedOr = '';
        try {
            const resolved = await resolveOrForStatusUpdate({
                requestId: id,
                existingOrNumber: beforeRows[0].or_number,
                providedOrNumber: orNumber,
                newStatus: status,
            });
            resolvedOr = resolved.orNumber;
        } catch (err) {
            const message =
                err instanceof OrBookletError
                    ? err.message
                    : 'Failed to assign OR number';
            return NextResponse.json({ error: message }, { status: 400 });
        }

        let result;
        if (rejectionReason) {
            result = await query(
                'UPDATE requests SET status = $1, rejection_reason = $2, admin_notes = $3 WHERE id = $4 RETURNING *',
                [status, rejectionReason, '', id]
            );
        } else {
            result = await query(
                'UPDATE requests SET status = $1, admin_notes = $2, or_number = $3 WHERE id = $4 RETURNING *',
                [status, '', resolvedOr, id]
            );
        }

        if (result.rowCount === 0) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        const { rows: docs } = await query('SELECT * FROM request_documents WHERE request_id = $1', [id]);
        const orBooklet = orBookletSummary(await loadOrBooklet());
        return NextResponse.json({
            success: true,
            request: toCamel(result.rows[0], docs),
            orBooklet,
        });
    } catch (err) {
        const message =
            err instanceof OrBookletError ? err.message : 'Update failed: ' + err.message;
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
