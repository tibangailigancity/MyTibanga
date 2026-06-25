import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { purgeExpiredPendingRequests } from '@/lib/requestExpiry';
import {
    buildAutoRcdRows,
    formatMoney,
    formatRcdDisplayDate,
    groupCollectionsByDate,
    mergeRcdRows,
    resolveRcdPeriodParams,
    sumRcdRows,
} from '@/lib/rcdCollections';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function ensureRcdTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS rcd_manual_collections (
            id BIGSERIAL PRIMARY KEY,
            collection_date DATE NOT NULL,
            or_number TEXT NOT NULL DEFAULT '',
            payor TEXT NOT NULL DEFAULT '',
            collection_name TEXT NOT NULL DEFAULT '',
            amount NUMERIC(10,2) NOT NULL DEFAULT 0,
            doc_stamp NUMERIC(10,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        )
    `);
}

async function fetchRequestsForRcd() {
    const { rows } = await query(
        `SELECT
            r.id, r.resident_name, r.date, r.status, r.or_number,
            d.name AS doc_name, d.quantity AS doc_quantity,
            d.unit_price AS doc_unit_price, d.total AS doc_total
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
                residentName: row.resident_name,
                date: row.date,
                status: row.status,
                orNumber: row.or_number || '',
                documents: [],
            });
        }
        if (row.doc_name) {
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

function buildTableRows(collections) {
    const groups = groupCollectionsByDate(collections);
    const parts = [];

    for (const group of groups) {
        for (const row of group.rows) {
            const stamp = Number(row.docStamp || 0);
            const displayDate = formatRcdDisplayDate(row.date);
            parts.push(`<tr>
            <td>${escapeHtml(displayDate)}</td>
            <td>${escapeHtml(row.orNumber)}</td>
            <td>${escapeHtml(row.payor)}</td>
            <td>${escapeHtml(row.collectionName)}</td>
            <td class="num">${escapeHtml(formatMoney(row.amount))}</td>
            <td class="num">${stamp > 0 ? escapeHtml(formatMoney(stamp)) : '&nbsp;'}</td>
        </tr>`);
        }
        parts.push(`<tr class="subtotal">
            <td colspan="4" style="text-align:right;">SUB TOTAL</td>
            <td class="num">${escapeHtml(formatMoney(group.subtotal.amount))}</td>
            <td class="num">${group.subtotal.docStamp > 0 ? escapeHtml(formatMoney(group.subtotal.docStamp)) : '&nbsp;'}</td>
        </tr>`);
    }

    return parts.join('');
}

function buildRcdHtml({ periodLabel, collections, totals, treasurerName = '' }) {
    const treasurer = treasurerName.trim() || '_______________________________';
    const [year, month] = new Date().toISOString().slice(0, 10).split('-');
    const rcdNo = `${year}-${month}-`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Report of Collection and Deposits - ${escapeHtml(periodLabel)}</title>
  <style>
    body { font-family: "Times New Roman", serif; margin: 0; padding: 20px; color: #111; font-size: 12px; }
    .sheet { max-width: 1000px; margin: 0 auto; }
    .center { text-align: center; }
    .title { font-size: 18px; font-weight: 700; margin: 12px 0; letter-spacing: 0.5px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 16px 0 20px; font-size: 12px; }
    .meta-grid div { margin: 2px 0; }
    .section-title { font-weight: 700; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #222; padding: 5px 6px; vertical-align: top; }
    th { background: #f2f2f2; font-weight: 700; text-align: center; }
    td.num { text-align: right; white-space: nowrap; }
    .subtotal td { font-weight: 700; background: #fafafa; }
    .sign { margin-top: 48px; text-align: center; }
    .sign .name { margin-top: 4px; font-weight: 700; }
    @media print {
      body { padding: 0; }
      .sheet { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="center">
      <div>Republic of the Philippines</div>
      <div>Province of Lanao del Norte</div>
      <div>City of Iligan</div>
      <div><strong>Barangay Tibanga</strong></div>
      <div class="title">REPORT OF COLLECTION AND DEPOSITS</div>
    </div>

    <div class="meta-grid">
      <div><strong>Name of Barangay Treasurer:</strong> ${escapeHtml(treasurer)}</div>
      <div><strong>RCD No.:</strong> ${escapeHtml(rcdNo)}_______</div>
      <div><strong>Barangay:</strong> TIBANGA</div>
      <div><strong>Period:</strong> ${escapeHtml(periodLabel)}</div>
    </div>

    <div class="section-title">A. COLLECTIONS</div>
    <table>
      <thead>
        <tr>
          <th colspan="2">Official Receipt / RCR</th>
          <th rowspan="2">Payor / DBC</th>
          <th rowspan="2">Name of Collection</th>
          <th rowspan="2">Amount</th>
          <th rowspan="2">Doc Stamp</th>
        </tr>
        <tr>
          <th>Date</th>
          <th>Number</th>
        </tr>
      </thead>
      <tbody>
        ${buildTableRows(collections)}
        ${groupCollectionsByDate(collections).length > 1 ? `<tr class="subtotal grand">
          <td colspan="4" style="text-align:right;">GRAND TOTAL</td>
          <td class="num">${escapeHtml(formatMoney(totals.amount))}</td>
          <td class="num">${totals.docStamp > 0 ? escapeHtml(formatMoney(totals.docStamp)) : '&nbsp;'}</td>
        </tr>` : ''}
      </tbody>
    </table>

    <div class="sign">
      <div class="name">${escapeHtml(treasurerName.trim() || 'Barangay Treasurer')}</div>
      <div><strong>Barangay Treasurer</strong></div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 250);
    });
  </script>
</body>
</html>`;
}

export async function GET(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        await purgeExpiredPendingRequests();
        await ensureRcdTable();

        const searchParams = new URL(request.url).searchParams;
        const range = resolveRcdPeriodParams(searchParams);
        const treasurerName = String(searchParams.get('treasurer') || '').trim();

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
        const html = buildRcdHtml({
            periodLabel: range.periodLabel,
            collections,
            totals,
            treasurerName,
        });

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to generate RCD printout' }, { status: 500 });
    }
}
