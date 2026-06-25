import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';

function normalizeDocumentName(name = '') {
    const raw = String(name).trim();
    const lowered = raw.toLowerCase();
    if (!raw) return '';

    if (/motorized\s*banca/.test(lowered)) return 'Barangay Certificate for Motorized Banca';
    if (/solo\s*parents?/.test(lowered)) return 'Barangay Certificate for Solo Parents';
    if (/indigency/.test(lowered)) return 'Barangay Certificate of Indigency';
    if (/residency/.test(lowered)) return 'Barangay Certificate of Residency';
    if (/barangay\s*certificate/.test(lowered) || /barangay\s*clearance/.test(lowered)) {
        return 'Barangay Certificate';
    }

    return raw;
}

export async function GET(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        await purgeExpiredPendingRequests();
        // Fetch requests only (report math does not need line-item docs).
        const { rows: requests } = await query('SELECT * FROM requests');
        const { rows: requestDocsRows } = await query(
            `SELECT
                rd.request_id AS request_id,
                rd.name AS document_name,
                rd.quantity AS quantity,
                r.date AS request_date,
                r.status AS request_status
             FROM request_documents rd
             JOIN requests r ON r.id = rd.request_id`
        );

        const requestList = requests.map(r => ({
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
        }));

        // Fetch residents
        const { rows: resRows } = await query('SELECT * FROM residents WHERE deleted_at IS NULL');
        const residents = resRows.map(r => ({
            firstName: r.first_name,
            lastName: r.last_name,
            birthdate: r.birthdate,
            purok: r.purok,
        }));

        // --- KPI Summary ---
        const totalResidents = residents.length;
        const totalRequests = requestList.length;
        const completedRequests = requestList.filter(r => r.status === 'completed');
        // Collection reflects active pipeline value (everything except rejected).
        const revenueRequests = requestList.filter((r) => r.status !== 'rejected');
        const totalRevenue = revenueRequests.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const completionRate = totalRequests > 0
            ? Math.round((completedRequests.length / totalRequests) * 100) : 0;

        const now = new Date();

        // --- Shared time filter params for time-series reports ---
        const searchParams = new URL(request.url).searchParams;
        const period = searchParams.get('period') || 'month'; // day | week | month | year
        const yearParam = parseInt(searchParams.get('year') || '', 10);
        const dayParam = searchParams.get('day') || '';
        const monthParam = searchParams.get('month') || '';
        const documentParam = searchParams.get('document') || 'all';

        const validRequestDates = requestList
            .map((r) => new Date(r.date))
            .filter((d) => !Number.isNaN(d.getTime()));
        const availableYears = [...new Set(validRequestDates.map((d) => d.getFullYear()))]
            .sort((a, b) => b - a);

        const normalizedDay = (!dayParam || Number.isNaN(new Date(dayParam).getTime()))
            ? now.toISOString().slice(0, 10)
            : dayParam;
        const normalizedYear = Number.isFinite(yearParam) ? yearParam : now.getFullYear();
        const normalizedMonth = /^\d{4}-\d{2}$/.test(monthParam)
            ? monthParam
            : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const normalizedDocument = documentParam.trim() || 'all';

        const buildSeries = (sourceRequests, valueGetter) => {
            const series = [];

            if (period === 'day') {
                const target = new Date(normalizedDay);
                const total = sourceRequests.reduce((sum, r) => {
                    const rd = new Date(r.date);
                    if (Number.isNaN(rd.getTime())) return sum;
                    if (
                        rd.getFullYear() === target.getFullYear() &&
                        rd.getMonth() === target.getMonth() &&
                        rd.getDate() === target.getDate()
                    ) {
                        return sum + valueGetter(r);
                    }
                    return sum;
                }, 0);
                series.push({
                    label: target.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                    shortLabel: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    value: total,
                    startTs: new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0, 0).getTime(),
                    endTs: new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999).getTime(),
                });
                return series;
            }

            if (period === 'week') {
                const target = new Date(normalizedDay);
                const dayOfWeek = target.getDay(); // 0 Sun..6 Sat
                const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const weekStart = new Date(target);
                weekStart.setDate(target.getDate() + diffToMonday);
                weekStart.setHours(0, 0, 0, 0);

                const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                for (let i = 0; i < 7; i++) {
                    const current = new Date(weekStart);
                    current.setDate(weekStart.getDate() + i);
                    const total = sourceRequests.reduce((sum, r) => {
                        const rd = new Date(r.date);
                        if (Number.isNaN(rd.getTime())) return sum;
                        if (
                            rd.getFullYear() === current.getFullYear() &&
                            rd.getMonth() === current.getMonth() &&
                            rd.getDate() === current.getDate()
                        ) {
                            return sum + valueGetter(r);
                        }
                        return sum;
                    }, 0);
                    series.push({
                        label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                        shortLabel: dayLabels[i],
                        value: total,
                        startTs: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 0, 0, 0, 0).getTime(),
                        endTs: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999).getTime(),
                    });
                }
                return series;
            }

            if (period === 'year') {
                for (let month = 0; month < 12; month++) {
                    const d = new Date(normalizedYear, month, 1);
                    const total = sourceRequests.reduce((sum, r) => {
                        const rd = new Date(r.date);
                        if (Number.isNaN(rd.getTime())) return sum;
                        if (rd.getMonth() === month && rd.getFullYear() === normalizedYear) {
                            return sum + valueGetter(r);
                        }
                        return sum;
                    }, 0);
                    series.push({
                        label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
                        shortLabel: d.toLocaleString('default', { month: 'short' }),
                        value: total,
                        startTs: new Date(normalizedYear, month, 1, 0, 0, 0, 0).getTime(),
                        endTs: new Date(normalizedYear, month + 1, 0, 23, 59, 59, 999).getTime(),
                    });
                }
                return series;
            }

            // Default: month view (daily buckets in selected month)
            const [y, m] = normalizedMonth.split('-').map((n) => parseInt(n, 10));
            const daysInMonth = new Date(y, m, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const current = new Date(y, m - 1, day);
                const total = sourceRequests.reduce((sum, r) => {
                    const rd = new Date(r.date);
                    if (Number.isNaN(rd.getTime())) return sum;
                    if (
                        rd.getFullYear() === current.getFullYear() &&
                        rd.getMonth() === current.getMonth() &&
                        rd.getDate() === current.getDate()
                    ) {
                        return sum + valueGetter(r);
                    }
                    return sum;
                }, 0);
                series.push({
                    label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    shortLabel: String(day),
                    value: total,
                    startTs: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 0, 0, 0, 0).getTime(),
                    endTs: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999).getTime(),
                });
            }
            return series;
        };

        // --- Report 1: Documents Requested ---
        let monthlyDocs = buildSeries(requestList, () => 1).map((d) => ({ ...d, count: d.value }));

        // --- Report 1a: Document Quantity Requested ---
        const requestDocLines = requestDocsRows
            .map((row) => ({
                requestId: Number(row.request_id),
                name: normalizeDocumentName(row.document_name || ''),
                quantity: Number(row.quantity || 0),
                date: row.request_date,
                status: row.request_status,
            }))
            .filter((row) => row.name && row.status !== 'rejected' && row.status !== 'declined');

        const availableDocuments = [...new Set(requestDocLines.map((d) => d.name))]
            .sort((a, b) => a.localeCompare(b));

        const filteredDocLines = normalizedDocument === 'all'
            ? requestDocLines
            : requestDocLines.filter((d) => d.name === normalizedDocument);
        if (normalizedDocument !== 'all') {
            const filteredRequestIds = new Set(filteredDocLines.map((d) => d.requestId));
            monthlyDocs = buildSeries(
                requestList.filter((r) => filteredRequestIds.has(Number(r.id))),
                () => 1
            ).map((d) => ({ ...d, count: d.value }));
        }

        const documentQuantitySeries = buildSeries(filteredDocLines, (d) => Number(d.quantity || 0))
            .map((d) => ({ ...d, quantity: Number(d.value || 0) }));
        const totalDocumentQuantity = documentQuantitySeries.reduce((sum, d) => sum + d.quantity, 0);

        // --- Report 1b: Collection Summary (value of non-rejected requests) ---
        const collectionRequests = requestList.filter((r) => r.status !== 'rejected');
        const collectionSeries = buildSeries(collectionRequests, (r) => Number(r.totalAmount || 0))
            .map((d) => {
                const transactions = collectionRequests.reduce((count, req) => {
                    const rd = new Date(req.date);
                    if (Number.isNaN(rd.getTime())) return count;
                    const ts = rd.getTime();
                    if (ts >= d.startTs && ts <= d.endTs) return count + 1;
                    return count;
                }, 0);
                return {
                    ...d,
                    amount: Number(d.value || 0),
                    transactions,
                };
            });
        const collectionTotal = collectionSeries.reduce((sum, d) => sum + d.amount, 0);
        const collectionAverage = collectionSeries.length > 0 ? collectionTotal / collectionSeries.length : 0;
        const bestCollectionBucket = collectionSeries.reduce(
            (best, current) => (current.amount > (best?.amount || 0) ? current : best),
            null
        );

        // --- Report 1c: Payment Method Summary (cash vs online) ---
        const paymentSummarySeries = [];
        const buckets = buildSeries(requestList, () => 0);
        for (const bucket of buckets) {
            let cashCount = 0;
            let onlineCount = 0;
            let cashAmount = 0;
            let onlineAmount = 0;

            requestList.forEach((r) => {
                const rd = new Date(r.date);
                if (Number.isNaN(rd.getTime())) return;
                const ts = rd.getTime();
                if (ts < bucket.startTs || ts > bucket.endTs) return;

                const method = (r.paymentMethod || '').toLowerCase();
                const isOnline = method === 'online' || method === 'gcash' || method === 'bank';
                if (isOnline) {
                    onlineCount++;
                    onlineAmount += Number(r.totalAmount || 0);
                } else {
                    cashCount++;
                    cashAmount += Number(r.totalAmount || 0);
                }
            });

            paymentSummarySeries.push({
                label: bucket.label,
                shortLabel: bucket.shortLabel,
                cashCount,
                onlineCount,
                cashAmount,
                onlineAmount,
            });
        }

        const paymentTotals = paymentSummarySeries.reduce((acc, row) => {
            acc.cashCount += row.cashCount;
            acc.onlineCount += row.onlineCount;
            acc.cashAmount += row.cashAmount;
            acc.onlineAmount += row.onlineAmount;
            return acc;
        }, { cashCount: 0, onlineCount: 0, cashAmount: 0, onlineAmount: 0 });

        // --- Report 2: Age Distribution per Purok (all residents) ---
        const ageBrackets = [
            { label: '0-4', min: 0, max: 4 },
            { label: '5-9', min: 5, max: 9 },
            { label: '10-14', min: 10, max: 14 },
            { label: '15-19', min: 15, max: 19 },
            { label: '20-24', min: 20, max: 24 },
            { label: '25-29', min: 25, max: 29 },
            { label: '30-34', min: 30, max: 34 },
            { label: '35-39', min: 35, max: 39 },
            { label: '40-44', min: 40, max: 44 },
            { label: '45-49', min: 45, max: 49 },
            { label: '50-54', min: 50, max: 54 },
            { label: '55-59', min: 55, max: 59 },
            { label: '60+', min: 60, max: 200 },
        ];

        const ageByPurok = { All: ageBrackets.map(b => ({ label: b.label, count: 0 })) };
        residents.forEach(r => {
            if (!r.birthdate) return;
            const birth = new Date(r.birthdate);
            let age = now.getFullYear() - birth.getFullYear();
            const m = now.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;

            const purok = r.purok || 'Unknown';
            if (!ageByPurok[purok]) {
                ageByPurok[purok] = ageBrackets.map(b => ({ label: b.label, count: 0 }));
            }

            const bracket = ageBrackets.findIndex(b => age >= b.min && age <= b.max);
            if (bracket !== -1) {
                ageByPurok[purok][bracket].count++;
                ageByPurok.All[bracket].count++;
            }
        });

        // --- Report 3: Residents per Purok ---
        const purokMap = {};
        residents.forEach(r => {
            const p = r.purok || 'Unknown';
            purokMap[p] = (purokMap[p] || 0) + 1;
        });
        const purokStats = Object.entries(purokMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => {
                const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
                return numA - numB;
            });

        return NextResponse.json({
            summary: { totalResidents, totalRequests, totalRevenue, completionRate },
            monthlyDocs,
            documentQuantitySummary: {
                series: documentQuantitySeries,
                total: totalDocumentQuantity,
                selectedDocument: normalizedDocument,
            },
            collectionSummary: {
                series: collectionSeries,
                total: collectionTotal,
                average: collectionAverage,
                peakLabel: bestCollectionBucket?.label || null,
                peakAmount: bestCollectionBucket?.amount || 0,
            },
            paymentMethodSummary: {
                series: paymentSummarySeries,
                totals: paymentTotals,
            },
            availableYears,
            reportFilter: {
                period,
                year: normalizedYear,
                day: normalizedDay,
                month: normalizedMonth,
                document: normalizedDocument,
            },
            availableDocuments,
            ageByPurok,
            purokStats,
            purokMap,
        });
    } catch (error) {
        return NextResponse.json(
            { summary: {}, monthlyDocs: [], ageByPurok: {}, purokStats: [] },
            { status: 500 }
        );
    }
}
