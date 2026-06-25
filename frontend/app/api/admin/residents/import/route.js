import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { normalizeChildrenArrays } from '@/lib/residentChildren';
import { validateSoloParentSector } from '@/lib/residentValidation';
import { generateRandomPassword } from '@/lib/generatePassword';
import { sendResidentWelcomeSms } from '@/lib/residentWelcomeSms';
import { generateResidentUsername } from '@/lib/residentUsername';

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur.trim());
    return out;
}

function rowToObject(headers, values) {
    const obj = {};
    headers.forEach((h, i) => {
        obj[h] = values[i] ?? '';
    });
    return obj;
}

async function insertResident(body) {
    const plainPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const childList = body.children
        ? String(body.children).split(';').map((s) => s.trim()).filter(Boolean)
        : [];
    const { children: childNames, childrenAges: childAges } = normalizeChildrenArrays(
        childList,
        []
    );
    const sector = String(body.sector || '').trim();
    const soloParent = sector === 'Solo parent';

    const soloErr = validateSoloParentSector(sector, childNames);
    if (soloErr) throw new Error(soloErr);

    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const purok = String(body.purok || '').trim();
    if (!firstName || !lastName) throw new Error('firstName and lastName are required');
    if (!purok) throw new Error('purok is required');

    let username = generateResidentUsername({
        firstName,
        lastName,
        explicitUsername: body.username,
    });

    const { rows: dupUser } = await query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
        [username]
    );
    if (dupUser.length > 0) {
        throw new Error(`username "${username}" already exists`);
    }

    await query(
        `INSERT INTO residents (
            first_name, middle_name, last_name, suffix,
            sex, civil_status, birthdate, birthplace, religion, household, housing_status, sector, solo_parent,
            citizenship, purok, barangay, city, mobile_number,
            email, mothers_maiden_name, fathers_name, spouses_name,
            mother_deceased, father_deceased, spouse_deceased,
            childs_name, childs_mother, children, children_ages, username, password, id_picture
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        )`,
        [
            firstName, body.middleName || '', lastName, body.suffix || '',
            body.sex || '', body.civilStatus || '', body.birthdate || '', body.birthplace || '',
            body.religion || '', body.household || '', body.housingStatus || '', sector, soloParent,
            body.citizenship || '', purok, body.barangay || 'Tibanga', body.city || 'Iligan City',
            body.mobileNumber || '', body.email || '', body.mothersMaidenName || '', body.fathersName || '',
            body.spousesName || '', false, false, false,
            '', '', childNames, childAges,
            username, hashedPassword, '',
        ]
    );

    const displayName = `${firstName} ${lastName}`.trim();
    await query(
        `INSERT INTO users (name, username, email, password, role, mobile_number, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [displayName, username, body.email || '', hashedPassword, 'resident', body.mobileNumber || '', true]
    );

    const sms = await sendResidentWelcomeSms(body.mobileNumber, plainPassword);
    return { username, smsSent: sms.sent, smsReason: sms.reason || '', tempPassword: plainPassword };
}

export async function POST(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const body = await request.json();
        const csvText = String(body.csv || '').trim();
        if (!csvText) {
            return NextResponse.json({ error: 'CSV content is required' }, { status: 400 });
        }

        const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
            return NextResponse.json(
                { error: 'CSV must include a header row and at least one data row' },
                { status: 400 }
            );
        }

        const headers = parseCsvLine(lines[0]).map((h) => h.trim());
        for (const col of ['firstName', 'lastName', 'purok']) {
            if (!headers.includes(col)) {
                return NextResponse.json({ error: `Missing required column: ${col}` }, { status: 400 });
            }
        }

        const imported = [];
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            if (values.every((v) => !String(v).trim())) continue;
            const row = rowToObject(headers, values);
            try {
                const { username, smsSent, smsReason, tempPassword } = await insertResident(row);
                imported.push({
                    row: i + 1,
                    name: `${row.firstName} ${row.lastName}`.trim(),
                    username,
                    tempPassword,
                    smsSent,
                    smsReason: smsSent ? '' : smsReason,
                });
            } catch (err) {
                errors.push({ row: i + 1, message: err.message || 'Import failed' });
            }
        }

        return NextResponse.json({
            success: errors.length === 0,
            importedCount: imported.length,
            imported,
            errors,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
    }
}
