import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';

export async function GET() {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        await purgeExpiredPendingRequests();
        // Fetch requests with their documents
        const { rows: reqRows } = await query('SELECT * FROM requests');
        const { rows: reqDocs } = await query('SELECT * FROM request_documents');

        const requests = reqRows.map(r => ({
            id: r.id,
            requestNo: r.request_no,
            residentName: r.resident_name,
            totalAmount: parseFloat(r.total_amount),
            date: r.date,
            status: r.status,
            paymentMethod: r.payment_method,
            referenceNo: r.reference_no,
            orNumber: r.or_number || '',
            rejectionReason: r.rejection_reason,
            documents: reqDocs
                .filter(d => d.request_id === r.id)
                .map(d => ({ name: d.name, quantity: d.quantity, unitPrice: parseFloat(d.unit_price), total: parseFloat(d.total) })),
        }));

        // Fetch residents
        const { rows: resRows } = await query('SELECT * FROM residents WHERE deleted_at IS NULL');
        const residents = resRows.map(r => ({
            id: r.id, firstName: r.first_name, middleName: r.middle_name, lastName: r.last_name,
            suffix: r.suffix, sex: r.sex, civilStatus: r.civil_status, birthdate: r.birthdate,
            birthplace: r.birthplace, religion: r.religion, citizenship: r.citizenship,
            purok: r.purok, barangay: r.barangay, city: r.city, mobileNumber: r.mobile_number,
            email: r.email,
        }));

        return NextResponse.json({ requests, residents });
    } catch (error) {
        return NextResponse.json({ requests: [], residents: [] }, { status: 500 });
    }
}
