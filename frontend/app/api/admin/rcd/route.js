import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';
import {
    buildAutoRcdRows,
    mergeRcdRows,
    parseRequestDateToYmd,
    resolveRcdPeriodParams,
    sumRcdRows,
} from '@/lib/rcdCollections';

async function ensureRcdTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS rcd_manual_collections (
            id               BIGSERIAL PRIMARY KEY,
            collection_date  DATE NOT NULL,
            or_number        TEXT NOT NULL DEFAULT '',
            payor            TEXT NOT NULL DEFAULT '',
            collection_name  TEXT NOT NULL DEFAULT '',
            amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
            doc_stamp        NUMERIC(10,2) DEFAULT 0,
            created_at       TIMESTAMPTZ DEFAULT NOW(),
            created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL
        )
    `);
    await query(`
        CREATE INDEX IF NOT EXISTS idx_rcd_manual_collection_date
        ON rcd_manual_collections(collection_date)
    `);
}

async function fetchRequestsForRcd() {
    const { rows } = await query(
        `SELECT
            r.id,
            r.request_no,
            r.resident_name,
            r.date,
            r.status,
            r.or_number,
            d.id AS doc_id,
            d.name AS doc_name,
            d.quantity AS doc_quantity,
            d.unit_price AS doc_unit_price,
            d.total AS doc_total
         FROM requests r
         LEFT JOIN request_documents d ON d.request_id = r.id
         WHERE r.status IN ('approved', 'for_release', 'completed')
           AND TRIM(COALESCE(r.or_number, '')) <> ''
         ORDER BY r.id DESC, d.id ASC`
    );

    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.id)) {
            grouped.set(row.id, {
                id: row.id,
                requestNo: row.request_no,
                residentName: row.resident_name,
                date: row.date,
                status: row.status,
                orNumber: row.or_number || '',
                documents: [],
            });
        }
        if (row.doc_id != null) {
            grouped.get(row.id).documents.push({
                name: row.doc_name,
                quantity: row.doc_quantity,
                unitPrice: parseFloat(row.doc_unit_price),
                total: parseFloat(row.doc_total),
            });
        }
    }
    return Array.from(grouped.values());
}

async function loadRcdData(searchParams) {
    const range = resolveRcdPeriodParams(searchParams);
    const requests = await fetchRequestsForRcd();
    const autoRows = buildAutoRcdRows(requests, range.startYmd, range.endYmd);

    const { rows: manualRows } = await query(
        `SELECT id, collection_date, or_number, payor, collection_name, amount, doc_stamp
         FROM rcd_manual_collections
         WHERE collection_date >= $1::date AND collection_date <= $2::date
         ORDER BY collection_date ASC, id ASC`,
        [range.startYmd, range.endYmd]
    );

    const collections = mergeRcdRows(autoRows, manualRows);
    const totals = sumRcdRows(collections);

    return {
        period: range.period,
        periodLabel: range.periodLabel,
        startDate: range.startYmd,
        endDate: range.endYmd,
        autoCollections: autoRows,
        manualCollections: manualRows.map((row) => ({
            id: row.id,
            date: parseRequestDateToYmd(row.collection_date) || range.startYmd,
            orNumber: row.or_number || '',
            payor: row.payor || '',
            collectionName: row.collection_name || '',
            amount: Number(row.amount || 0),
            docStamp: Number(row.doc_stamp || 0),
        })),
        collections,
        totals,
    };
}

export async function GET(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        await purgeExpiredPendingRequests();
        await ensureRcdTable();

        const searchParams = new URL(request.url).searchParams;
        const data = await loadRcdData(searchParams);

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to load RCD data' }, { status: 500 });
    }
}

export async function POST(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        await ensureRcdTable();
        const body = await request.json();
        const reportDate = String(body.collectionDate || body.date || '').slice(0, 10);
        const orNumber = String(body.orNumber || '').trim();
        const payor = String(body.payor || '').trim();
        const collectionName = String(body.collectionName || '').trim();
        const amount = Number(body.amount);
        const docStamp = body.docStamp === '' || body.docStamp == null
            ? null
            : Number(body.docStamp);

        if (!reportDate || Number.isNaN(new Date(reportDate).getTime())) {
            return NextResponse.json({ error: 'Valid date is required.' }, { status: 400 });
        }
        if (!orNumber) {
            return NextResponse.json({ error: 'OR number is required.' }, { status: 400 });
        }
        if (!payor) {
            return NextResponse.json({ error: 'Payor name is required.' }, { status: 400 });
        }
        if (!collectionName) {
            return NextResponse.json({ error: 'Collection name is required.' }, { status: 400 });
        }
        if (!Number.isFinite(amount) || amount < 0) {
            return NextResponse.json({ error: 'Amount must be zero or greater.' }, { status: 400 });
        }

        const stampValue = docStamp == null ? 0 : (Number.isFinite(docStamp) ? docStamp : 0);

        const { rows } = await query(
            `INSERT INTO rcd_manual_collections
                (collection_date, or_number, payor, collection_name, amount, doc_stamp, created_by)
             VALUES ($1::date, $2, $3, $4, $5, $6, $7)
             RETURNING id, collection_date, or_number, payor, collection_name, amount, doc_stamp`,
            [
                reportDate,
                orNumber,
                payor,
                collectionName,
                amount,
                stampValue,
                gate.session?.id ?? null,
            ]
        );

        const row = rows[0];
        return NextResponse.json({
            success: true,
            entry: {
                id: row.id,
                date: parseRequestDateToYmd(row.collection_date),
                orNumber: row.or_number,
                payor: row.payor,
                collectionName: row.collection_name,
                amount: Number(row.amount || 0),
                docStamp: Number(row.doc_stamp || 0),
            },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save collection entry' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        await ensureRcdTable();
        const searchParams = new URL(request.url).searchParams;
        const id = Number.parseInt(searchParams.get('id') || '', 10);
        if (!Number.isFinite(id)) {
            return NextResponse.json({ error: 'Invalid entry id.' }, { status: 400 });
        }

        const { rowCount } = await query(
            'DELETE FROM rcd_manual_collections WHERE id = $1',
            [id]
        );
        if (!rowCount) {
            return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete collection entry' }, { status: 500 });
    }
}
