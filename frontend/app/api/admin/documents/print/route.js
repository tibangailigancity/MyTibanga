import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { purposeForDocumentPrint } from '@/lib/documentPurpose';
import { documentNameRequiresPurpose } from '@/lib/documentPurposeServer';

async function resolvePrintPurpose(docName, purpose) {
    const requires = await documentNameRequiresPurpose(docName);
    return purposeForDocumentPrint(requires, purpose);
}

const BLACK = rgb(0, 0, 0);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPrettyDate(dateLike) {
    const parsed = new Date(dateLike || Date.now());
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Manila',
    });
}

function dateParts(dateLike) {
    const parsed = new Date(dateLike || Date.now());
    if (Number.isNaN(parsed.getTime())) {
        return { month: '', day: '', year: '' };
    }
    return {
        month: parsed.toLocaleDateString('en-PH', { month: 'long', timeZone: 'Asia/Manila' }),
        day: parsed.toLocaleDateString('en-PH', { day: 'numeric', timeZone: 'Asia/Manila' }),
        year: parsed.toLocaleDateString('en-PH', { year: 'numeric', timeZone: 'Asia/Manila' }),
    };
}

function computeAge(birthdate) {
    const text = String(birthdate || '').trim();
    if (!text) return '';
    const dob = new Date(text);
    if (Number.isNaN(dob.getTime())) return '';
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        age -= 1;
    }
    return age >= 0 ? String(age) : '';
}

function composeFullName(resident, fallbackName = '') {
    if (!resident) return String(fallbackName || '').trim();
    const first = String(resident.first_name || '').trim();
    const middle = String(resident.middle_name || '').trim();
    const last = String(resident.last_name || '').trim();
    const suffix = String(resident.suffix || '').trim();
    const built = [first, middle, last, suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    return built || String(fallbackName || '').trim();
}

function normalizePurok(purok) {
    const raw = String(purok || '').trim();
    if (!raw) return '';
    return raw.replace(/^purok[\s\-_:]*/i, '').trim();
}

function drawFittedText(page, font, text, opts = {}) {
    const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const {
        x = 0,
        y = 0,
        maxWidth = 120,
        size = 10,
        minSize = 7,
        align = 'left',
        color = BLACK,
    } = opts;

    let fontSize = size;
    let width = font.widthOfTextAtSize(raw, fontSize);
    while (fontSize > minSize && width > maxWidth) {
        fontSize -= 0.5;
        width = font.widthOfTextAtSize(raw, fontSize);
    }

    let drawX = x;
    if (align === 'center') drawX = x + Math.max(0, (maxWidth - width) / 2);
    if (align === 'right') drawX = x + Math.max(0, maxWidth - width);

    page.drawText(raw, { x: drawX, y, size: fontSize, font, color });
}

async function getRequestContext(requestId) {
    const { rows } = await query(
        `SELECT
            r.id,
            r.request_no,
            r.resident_name,
            r.date,
            r.user_id,
            r.purpose,
            rd.name AS document_name,
            rd.quantity
         FROM requests r
         LEFT JOIN request_documents rd ON rd.request_id = r.id
         WHERE r.id = $1
         ORDER BY rd.id ASC`,
        [requestId]
    );
    if (!rows.length) return null;
    const base = rows[0];
    return {
        id: base.id,
        requestNo: base.request_no,
        residentName: base.resident_name,
        date: base.date,
        userId: base.user_id,
        purpose: String(base.purpose || '').trim(),
        documents: rows
            .filter((r) => r.document_name)
            .map((r) => ({ name: r.document_name, quantity: Number(r.quantity || 1) })),
    };
}

async function resolveResidentProfile(ctx) {
    if (ctx.userId) {
        const byUserId = await query(
            `SELECT first_name, middle_name, last_name, suffix, birthdate, birthplace, purok, barangay, city
             FROM residents
             WHERE deleted_at IS NULL
               AND (
                   LOWER(TRIM(first_name || ' ' || COALESCE(middle_name, '') || ' ' || last_name || ' ' || COALESCE(suffix, ''))) = LOWER($1)
                   OR LOWER(TRIM(first_name || ' ' || last_name || ' ' || COALESCE(suffix, ''))) = LOWER($1)
               )
             ORDER BY id DESC
             LIMIT 1`,
            [String(ctx.residentName || '').trim()]
        );
        if (byUserId.rows[0]) return byUserId.rows[0];
    }

    const byName = await query(
        `SELECT first_name, middle_name, last_name, suffix, birthdate, birthplace, purok, barangay, city
         FROM residents
         WHERE deleted_at IS NULL
           AND (
               LOWER(TRIM(first_name || ' ' || COALESCE(middle_name, '') || ' ' || last_name || ' ' || COALESCE(suffix, ''))) = LOWER($1)
               OR LOWER(TRIM(first_name || ' ' || last_name || ' ' || COALESCE(suffix, ''))) = LOWER($1)
           )
         ORDER BY id DESC
         LIMIT 1`,
        [String(ctx.residentName || '').trim()]
    );
    return byName.rows[0] || null;
}

function buildClearanceHtml(data) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barangay Clearance - ${escapeHtml(data.fullName)}</title>
  <style>
    body { font-family: "Times New Roman", serif; margin: 0; padding: 24px; color: #111; }
    .sheet { max-width: 850px; margin: 0 auto; border: 1px solid #ddd; padding: 28px 34px; }
    .center { text-align: center; }
    .title { font-size: 28px; font-weight: 700; letter-spacing: 1px; margin: 18px 0 22px; }
    .sub { margin: 2px 0; font-size: 14px; }
    .body { margin-top: 22px; line-height: 1.7; font-size: 16px; }
    .indent { text-indent: 42px; }
    .value { font-weight: 700; text-decoration: underline; }
    .sign { margin-top: 54px; text-align: right; }
    .meta { margin-top: 26px; font-size: 13px; color: #333; }
    @media print {
      body { padding: 0; }
      .sheet { border: none; max-width: none; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="center">
      <div class="sub">Republic of the Philippines</div>
      <div class="sub">Province of Lanao del Norte</div>
      <div class="sub">City of Iligan</div>
      <div class="sub"><strong>Barangay Tibanga</strong></div>
      <div class="title">BARANGAY CLEARANCE</div>
    </div>

    <div class="body">
      <p class="indent">
        This is to certify that <span class="value">${escapeHtml(data.fullName)}</span>,
        <span class="value">${escapeHtml(data.age || '___')}</span> years old,
        a resident of <span class="value">Purok ${escapeHtml(data.purok || '___')}</span>,
        Barangay <span class="value">${escapeHtml(data.barangay || 'Tibanga')}</span>,
        <span class="value">${escapeHtml(data.city || 'Iligan City')}</span>, is known to be of
        good moral character and has no derogatory record on file in this barangay.
      </p>
      <p class="indent">
        Issued upon the request of the above-named person for whatever legal purpose it may serve.
      </p>
      <p>
        Given this <span class="value">${escapeHtml(data.issuedDate || '___')}</span>
        at Barangay Tibanga, Iligan City.
      </p>
    </div>

    <div class="sign">
      <strong>Barangay Captain</strong>
    </div>
    <div class="meta">
      Request No: ${escapeHtml(data.requestNo || '')}
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

function buildMotorizedBancaHtml(data) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barangay Certification - ${escapeHtml(data.fullName)}</title>
  <style>
    body { font-family: "Times New Roman", serif; margin: 0; padding: 24px; color: #111; }
    .sheet { max-width: 850px; margin: 0 auto; border: 1px solid #ddd; padding: 28px 34px; }
    .center { text-align: center; }
    .title { font-size: 27px; font-weight: 700; letter-spacing: 1px; margin: 18px 0 22px; }
    .sub { margin: 2px 0; font-size: 14px; }
    .body { margin-top: 22px; line-height: 1.7; font-size: 16px; }
    .indent { text-indent: 42px; }
    .value { font-weight: 700; text-decoration: underline; }
    .bancaGrid { margin: 16px 0; padding-left: 18px; }
    .row { display: flex; gap: 10px; margin: 4px 0; }
    .label { min-width: 180px; }
    .line { flex: 1; border-bottom: 1px solid #333; min-height: 20px; }
    .sign { margin-top: 54px; text-align: right; }
    .meta { margin-top: 26px; font-size: 13px; color: #333; }
    @media print {
      body { padding: 0; }
      .sheet { border: none; max-width: none; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="center">
      <div class="sub">Republic of the Philippines</div>
      <div class="sub">Province of Lanao del Norte</div>
      <div class="sub">City of Iligan</div>
      <div class="sub"><strong>Barangay Tibanga</strong></div>
      <div class="title">BARANGAY CERTIFICATION</div>
    </div>

    <div class="body">
      <p class="indent">
        THIS IS TO CERTIFY that <span class="value">${escapeHtml(data.fullName)}</span>,
        <span class="value">${escapeHtml(data.age || '___')}</span> years old, and a bonafide resident of
        Purok <span class="value">${escapeHtml(data.purok || '___')}</span>,
        Barangay <span class="value">${escapeHtml(data.barangay || 'Tibanga')}</span>,
        <span class="value">${escapeHtml(data.city || 'Iligan City')}</span>.
      </p>
      <p class="indent">
        Further, this certified individual is the owner of the following motorized banca/fishing vessel:
      </p>
      <div class="bancaGrid">
        <div class="row"><span class="label">Name of Banca</span><span class="line"></span></div>
        <div class="row"><span class="label">Length</span><span class="line"></span></div>
        <div class="row"><span class="label">Breadth</span><span class="line"></span></div>
        <div class="row"><span class="label">Depth</span><span class="line"></span></div>
        <div class="row"><span class="label">Make/Model of Engine</span><span class="line"></span></div>
        <div class="row"><span class="label">Serial Number</span><span class="line"></span></div>
        <div class="row"><span class="label">Place/Year Built</span><span class="line"></span></div>
      </div>
      <p class="indent">
        This certification is being issued for whatever legal purpose it may serve him/her best.
      </p>
      <p>
        Issued this <span class="value">${escapeHtml(data.issuedDate || '___')}</span>
        at Barangay Tibanga Hall, Iligan City.
      </p>
    </div>

    <div class="sign">
      <strong>Barangay Captain</strong>
    </div>
    <div class="meta">
      Request No: ${escapeHtml(data.requestNo || '')}
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

async function stampClearancePdf(data) {
    const templatePath = path.join(process.cwd(), 'public', 'documents', 'PDF', 'Barangay Clearance.pdf');
    if (!fs.existsSync(templatePath)) return null;
    const bytes = fs.readFileSync(templatePath);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

    // Line: "This is to certify that <full name> ... <age> years old ..."
    drawFittedText(page, font, data.fullName, { x: 310, y: 470, maxWidth: 150, size: 12, align: 'center' });
    drawFittedText(page, font, data.age, { x: 507, y: 470, maxWidth: 32, size: 12, align: 'center' });

    // Line: "... born on <birthday> in <birthplace>"
    drawFittedText(page, font, data.birthdate || '', { x: 380, y: 450, maxWidth: 100, size: 12, align: 'center' });
    drawFittedText(page, font, data.birthplace || '', { x: 100, y: 431, maxWidth: 120, size: 12, align: 'center' });

    // Line: "... resident of Purok <purok>"
    drawFittedText(page, font, data.purok, { x: 352, y: 431, maxWidth: 70, size: 12, align: 'center' });

    // Line: "Issued this <month> day of <day>, <year>"
    if (data.purpose) {
        drawFittedText(page, font, data.purpose, { x: 250, y: 300, maxWidth: 250, size: 11, minSize: 8 });
    }
    drawFittedText(page, font, data.issuedMonth || '', { x: 255, y: 269, maxWidth: 95, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedDay || '', { x: 170, y: 269, maxWidth: 35, size: 12, align: 'center' });

    return Buffer.from(await pdf.save());
}

async function stampBancaPdf(data) {
    const templatePath = path.join(process.cwd(), 'public', 'documents', 'PDF', 'Certificate for Motorized Banca.pdf');
    if (!fs.existsSync(templatePath)) return null;
    const bytes = fs.readFileSync(templatePath);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

    drawFittedText(page, font, data.fullName, { x: 250, y: 572, maxWidth: 150, size: 12, align: 'center' });
    drawFittedText(page, font, data.age, { x: 455, y: 572, maxWidth: 32, size: 12, align: 'center' });
    drawFittedText(page, font, data.purok, { x: 250, y: 555, maxWidth: 70, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedMonth || '', { x: 250, y: 308, maxWidth: 95, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedDay || '', { x: 165, y: 308, maxWidth: 35, size: 12, align: 'center' });

    return Buffer.from(await pdf.save());
}

async function stampResidencyPdf(data) {
    const templatePath = path.join(process.cwd(), 'public', 'documents', 'PDF', 'Certificate of Residency.pdf');
    if (!fs.existsSync(templatePath)) return null;
    const bytes = fs.readFileSync(templatePath);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

    drawFittedText(page, font, data.fullName, { x: 270, y: 439, maxWidth: 150, size: 12, align: 'center' });
    drawFittedText(page, font, data.age, { x: 455, y: 439, maxWidth: 32, size: 12, align: 'center' });
    drawFittedText(page, font, data.birthdate || '', { x: 125, y: 419, maxWidth: 100, size: 12, align: 'center' });
    drawFittedText(page, font, data.birthplace || '', { x: 315, y: 419, maxWidth: 120, size: 12, align: 'center' });
    drawFittedText(page, font, data.purok, { x: 97, y: 399, maxWidth: 70, size: 12, align: 'center' });
    drawFittedText(page, font, data.fullName, { x: 90, y: 300, maxWidth: 150, size: 12, align: 'center' });
    if (data.purpose) {
        drawFittedText(page, font, data.purpose, { x: 380, y: 300, maxWidth: 250, size: 11, minSize: 8 });
    }
    drawFittedText(page, font, data.issuedMonth || '', { x: 280, y: 249, maxWidth: 95, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedDay || '', { x: 175, y: 249, maxWidth: 35, size: 12, align: 'center' });
    
    return Buffer.from(await pdf.save());
}

async function stampIndigencyPdf(data) {
    const templatePath = path.join(process.cwd(), 'public', 'documents', 'PDF', 'Certificate of Indigency.pdf');
    if (!fs.existsSync(templatePath)) return null;
    const bytes = fs.readFileSync(templatePath);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

    drawFittedText(page, font, data.fullName, { x: 220, y: 730, maxWidth: 150, size: 12, align: 'center' });
    drawFittedText(page, font, data.age, { x: 390, y: 730, maxWidth: 32, size: 12, align: 'center' });
    drawFittedText(page, font, data.purok, { x: 72, y: 713, maxWidth: 70, size: 12, align: 'center' });
    drawFittedText(page, font, data.fullName, { x: 370, y: 645, maxWidth: 150, size: 12, align: 'center' });
    if (data.purpose) {
        drawFittedText(page, font, data.purpose, { x: 265, y: 628, maxWidth: 250, size: 11, minSize: 8 });
    }
    drawFittedText(page, font, data.issuedMonth || '', { x: 200, y: 602, maxWidth: 95, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedDay || '', { x: 149, y: 602, maxWidth: 35, size: 12, align: 'center' });
    drawFittedText(page, font, data.fullName, { x: 220, y: 291, maxWidth: 150, size: 12, align: 'center' });
    drawFittedText(page, font, data.age, { x: 390, y: 291, maxWidth: 32, size: 12, align: 'center' });
    drawFittedText(page, font, data.purok, { x: 72, y: 274, maxWidth: 70, size: 12, align: 'center' });
    drawFittedText(page, font, data.fullName, { x: 370, y: 206, maxWidth: 150, size: 12, align: 'center' });
    if (data.purpose) {
        drawFittedText(page, font, data.purpose, { x: 265, y: 188, maxWidth: 250, size: 11, minSize: 8 });
    }
    drawFittedText(page, font, data.issuedMonth || '', { x: 200, y: 163, maxWidth: 95, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedDay || '', { x: 149, y: 163, maxWidth: 35, size: 12, align: 'center' });

    return Buffer.from(await pdf.save());
}

async function stampSoloParentPdf(data) {
    const templatePath = path.join(process.cwd(), 'public', 'documents', 'PDF', 'Certificate for Solo Parents.pdf');
    if (!fs.existsSync(templatePath)) return null;
    const bytes = fs.readFileSync(templatePath);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

    drawFittedText(page, font, data.fullName, { x: 250, y: 498, maxWidth: 150, size: 12, align: 'center' });
    drawFittedText(page, font, data.age, { x: 402,  y: 498, maxWidth: 32, size: 12, align: 'center' });
    drawFittedText(page, font, data.purok, { x: 155, y: 482, maxWidth: 70, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedMonth || '', { x: 255, y: 280, maxWidth: 95, size: 12, align: 'center' });
    drawFittedText(page, font, data.issuedDay || '', { x: 190, y: 280, maxWidth: 35, size: 12, align: 'center' });

    return Buffer.from(await pdf.save());
}

// GET — serve the PDF version of a document for printing
// Usage: /api/admin/documents/print?file=/documents/Barangay Clearance.docx
export async function GET(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { searchParams } = new URL(request.url);
        const requestId = Number(searchParams.get('requestId'));
        const docName = String(searchParams.get('docName') || '');
        const filePath = searchParams.get('file');

        if (requestId && /barangay\s*clearance/i.test(docName)) {
            const ctx = await getRequestContext(requestId);
            if (!ctx) {
                return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            }
            const resident = await resolveResidentProfile(ctx);
            const birthDatePretty = resident?.birthdate
                ? formatPrettyDate(resident.birthdate)
                : '';
            const issued = dateParts(ctx.date || Date.now());
            const payload = {
                fullName: composeFullName(resident, ctx.residentName || ''),
                age: computeAge(resident?.birthdate || ''),
                purok: normalizePurok(resident?.purok || ''),
                barangay: resident?.barangay || 'Tibanga',
                city: resident?.city || 'Iligan City',
                birthdate: birthDatePretty,
                birthplace: resident?.birthplace || '',
                purpose: await resolvePrintPurpose(docName, ctx.purpose),
                requestNo: ctx.requestNo || '',
                issuedDate: formatPrettyDate(Date.now()),
                issuedMonth: issued.month,
                issuedDay: issued.day,
                issuedYear: issued.year,
            };
            const pdfBuffer = await stampClearancePdf(payload);
            if (pdfBuffer) {
                return new NextResponse(pdfBuffer, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline; filename="Barangay Clearance.pdf"',
                        'Cache-Control': 'no-store',
                    },
                });
            }
            const html = buildClearanceHtml(payload);
            return new NextResponse(html, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                },
            });
        }

        if (requestId && /motorized\s*banca|banca/i.test(docName)) {
            const ctx = await getRequestContext(requestId);
            if (!ctx) {
                return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            }
            const resident = await resolveResidentProfile(ctx);
            const issued = dateParts(ctx.date || Date.now());
            const birthDatePretty = resident?.birthdate
                ? formatPrettyDate(resident.birthdate)
                : '';
            const payload = {
                fullName: composeFullName(resident, ctx.residentName || ''),
                age: computeAge(resident?.birthdate || ''),
                birthdate: birthDatePretty,
                birthplace: resident?.birthplace || '',
                purok: normalizePurok(resident?.purok || ''),
                issuedMonth: issued.month,
                issuedDay: issued.day,
            };
            const pdfBuffer = await stampBancaPdf(payload);
            if (pdfBuffer) {
                return new NextResponse(pdfBuffer, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline; filename="Certificate for Motorized Banca.pdf"',
                        'Cache-Control': 'no-store',
                    },
                });
            }
            const html = buildMotorizedBancaHtml(payload);
            return new NextResponse(html, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                },
            });
        }

        if (requestId && /residency/i.test(docName)) {
            const ctx = await getRequestContext(requestId);
            if (!ctx) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            const resident = await resolveResidentProfile(ctx);
            const issued = dateParts(ctx.date || Date.now());
            const birthDatePretty = resident?.birthdate
                ? formatPrettyDate(resident.birthdate)
                : '';
            const payload = {
                fullName: composeFullName(resident, ctx.residentName || ''),
                age: computeAge(resident?.birthdate || ''),
                birthdate: birthDatePretty,
                birthplace: resident?.birthplace || '',
                purok: normalizePurok(resident?.purok || ''),
                purpose: await resolvePrintPurpose(docName, ctx.purpose),
                issuedMonth: issued.month,
                issuedDay: issued.day,
            };
            const pdfBuffer = await stampResidencyPdf(payload);
            if (pdfBuffer) {
                return new NextResponse(pdfBuffer, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline; filename="Certificate of Residency.pdf"',
                        'Cache-Control': 'no-store',
                    },
                });
            }
        }

        if (requestId && /indigency/i.test(docName)) {
            const ctx = await getRequestContext(requestId);
            if (!ctx) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            const resident = await resolveResidentProfile(ctx);
            const issued = dateParts(ctx.date || Date.now());
            const birthDatePretty = resident?.birthdate
                ? formatPrettyDate(resident.birthdate)
                : '';
            const payload = {
                fullName: composeFullName(resident, ctx.residentName || ''),
                age: computeAge(resident?.birthdate || ''),
                birthdate: birthDatePretty,
                birthplace: resident?.birthplace || '',
                purok: normalizePurok(resident?.purok || ''),
                purpose: await resolvePrintPurpose(docName, ctx.purpose),
                issuedMonth: issued.month,
                issuedDay: issued.day,
            };
            const pdfBuffer = await stampIndigencyPdf(payload);
            if (pdfBuffer) {
                return new NextResponse(pdfBuffer, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline; filename="Certificate of Indigency.pdf"',
                        'Cache-Control': 'no-store',
                    },
                });
            }
        }

        if (requestId && /solo\s*parent/i.test(docName)) {
            const ctx = await getRequestContext(requestId);
            if (!ctx) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            const resident = await resolveResidentProfile(ctx);
            const issued = dateParts(ctx.date || Date.now());
            const birthDatePretty = resident?.birthdate
                ? formatPrettyDate(resident.birthdate)
                : '';
            const payload = {
                fullName: composeFullName(resident, ctx.residentName || ''),
                age: computeAge(resident?.birthdate || ''),
                birthdate: birthDatePretty,
                birthplace: resident?.birthplace || '',
                purok: normalizePurok(resident?.purok || ''),
                issuedMonth: issued.month,
                issuedDay: issued.day,
            };
            const pdfBuffer = await stampSoloParentPdf(payload);
            if (pdfBuffer) {
                return new NextResponse(pdfBuffer, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline; filename="Certificate for Solo Parents.pdf"',
                        'Cache-Control': 'no-store',
                    },
                });
            }
        }

        if (!filePath) {
            return NextResponse.json({ error: 'File path is required' }, { status: 400 });
        }

        const cleanFilePath = String(filePath).split('?')[0];
        const lowerPath = cleanFilePath.toLowerCase();

        // Accept both .docx and .pdf inputs and normalize to a PDF path.
        // - /documents/Foo.docx  -> /documents/PDF/Foo.pdf
        // - /documents/PDF/Foo.pdf -> /documents/PDF/Foo.pdf
        // - /documents/Foo.pdf   -> /documents/PDF/Foo.pdf
        let pdfRelPath = '';
        if (lowerPath.endsWith('.docx')) {
            const baseName = path.basename(cleanFilePath, '.docx');
            pdfRelPath = `/documents/PDF/${baseName}.pdf`;
        } else if (lowerPath.endsWith('.pdf')) {
            if (lowerPath.includes('/documents/pdf/')) {
                pdfRelPath = cleanFilePath;
            } else {
                const pdfName = path.basename(cleanFilePath);
                pdfRelPath = `/documents/PDF/${pdfName}`;
            }
        } else {
            const baseName = path.basename(cleanFilePath);
            pdfRelPath = `/documents/PDF/${baseName}.pdf`;
        }

        const pdfNameForError = path.basename(pdfRelPath);
        const pdfAbsPath = path.join(process.cwd(), 'public', pdfRelPath);

        if (!fs.existsSync(pdfAbsPath)) {
            return NextResponse.json(
                { error: `PDF not found: ${pdfNameForError}. Please add it to public/documents/PDF/` },
                { status: 404 }
            );
        }

        // Read and serve the PDF directly
        const pdfBuffer = fs.readFileSync(pdfAbsPath);

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${pdfNameForError}"`,
            },
        });
    } catch (err) {
        return NextResponse.json({ error: 'Failed to load document: ' + err.message }, { status: 500 });
    }
}
