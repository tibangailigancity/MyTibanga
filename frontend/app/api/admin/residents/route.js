import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth';
import { normalizeChildrenArrays } from '@/lib/residentChildren';
import { validateSoloParentSector } from '@/lib/residentValidation';
import { generateRandomPassword } from '@/lib/generatePassword';
import { sendResidentWelcomeSms } from '@/lib/residentWelcomeSms';
import { generateResidentUsername } from '@/lib/residentUsername';

// GET — return active residents by default; pass ?archived=1 for soft-deleted residents
export async function GET(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const archived = new URL(request.url).searchParams.get('archived') === '1';
    const archivedSelect = `
        SELECT id, first_name, middle_name, last_name, suffix, purok, deleted_at, archive_reason
        FROM residents
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at DESC NULLS LAST, id DESC
    `;
    const activeSelect = `
        SELECT * FROM residents
        WHERE deleted_at IS NULL
        ORDER BY id
    `;
    const { rows } = await query(archived ? archivedSelect : activeSelect);
    // Convert snake_case to camelCase for frontend compatibility
    const residents = rows.map(r => ({
        id: r.id,
        firstName: r.first_name,
        middleName: r.middle_name,
        lastName: r.last_name,
        suffix: r.suffix,
        sex: r.sex,
        civilStatus: r.civil_status,
        birthdate: r.birthdate,
        birthplace: r.birthplace,
        religion: r.religion,
        household: r.household,
        housingStatus: r.housing_status,
        sector: r.sector || '',
        soloParent: r.solo_parent === true,
        citizenship: r.citizenship,
        purok: r.purok,
        barangay: r.barangay,
        city: r.city,
        mobileNumber: r.mobile_number,
        email: r.email,
        mothersMaidenName: r.mothers_maiden_name,
        fathersName: r.fathers_name,
        spousesName: r.spouses_name,
        motherDeceased: r.mother_deceased === true,
        fatherDeceased: r.father_deceased === true,
        spouseDeceased: r.spouse_deceased === true,
        childsName: r.childs_name,
        childsMother: r.childs_mother,
        children: r.children || [],
        childrenAges: r.children_ages || [],
        username: r.username,
        password: '',
        idPicture: r.id_picture,
        deletedAt: r.deleted_at,
        archiveReason: r.archive_reason || '',
    }));
    return NextResponse.json({ residents });
}

// POST — add a new resident
export async function POST(request) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const body = await request.json();
        const plainPassword = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const { children: childNames, childrenAges: childAges } = normalizeChildrenArrays(
            Array.isArray(body.children) ? body.children : [],
            Array.isArray(body.childrenAges) ? body.childrenAges : []
        );
        const sector = String(body.sector || '').trim();
        const soloParent = sector === 'Solo parent' || !!body.soloParent;

        const soloErr = validateSoloParentSector(sector, childNames);
        if (soloErr) {
            return NextResponse.json({ success: false, message: soloErr }, { status: 400 });
        }

        let username = generateResidentUsername({
            firstName: body.firstName,
            lastName: body.lastName,
            explicitUsername: body.username,
        });

        const { rows } = await query(
            `INSERT INTO residents (
                first_name, middle_name, last_name, suffix,
                sex, civil_status, birthdate, birthplace, religion, household, housing_status, sector, solo_parent,
                citizenship, purok, barangay, city, mobile_number,
                email, mothers_maiden_name, fathers_name, spouses_name,
                mother_deceased, father_deceased, spouse_deceased,
                childs_name, childs_mother, children, children_ages, username, password, id_picture
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
            ) RETURNING *`,
            [
                body.firstName, body.middleName || '', body.lastName, body.suffix || '',
                body.sex || '', body.civilStatus || '', body.birthdate || '', body.birthplace || '', body.religion || '', body.household || '', body.housingStatus || '',
                sector,
                soloParent,
                body.citizenship || '', body.purok || '', body.barangay || 'Tibanga', body.city || 'Iligan City', body.mobileNumber || '',
                body.email || '', body.mothersMaidenName || '', body.fathersName || '', body.spousesName || '',
                !!body.motherDeceased,
                !!body.fatherDeceased,
                !!body.spouseDeceased,
                body.childsName || '', body.childsMother || '',
                childNames,
                childAges,
                username, hashedPassword, body.idPicture || '',
            ]
        );

        const r = rows[0];
        const newResident = {
            id: r.id, firstName: r.first_name, middleName: r.middle_name, lastName: r.last_name,
            suffix: r.suffix, sex: r.sex, civilStatus: r.civil_status, birthdate: r.birthdate,
            birthplace: r.birthplace, religion: r.religion, household: r.household, housingStatus: r.housing_status,
            sector: r.sector || '',
            soloParent: r.solo_parent === true, citizenship: r.citizenship,
            purok: r.purok, barangay: r.barangay, city: r.city, mobileNumber: r.mobile_number,
            email: r.email, mothersMaidenName: r.mothers_maiden_name, fathersName: r.fathers_name,
            spousesName: r.spouses_name,
            motherDeceased: r.mother_deceased === true,
            fatherDeceased: r.father_deceased === true,
            spouseDeceased: r.spouse_deceased === true,
            children: r.children || [], childrenAges: r.children_ages || [],
            username: r.username, password: '', idPicture: r.id_picture,
        };

        let account = {
            username,
            smsSent: false,
            smsReason: newResident.username ? 'pending' : 'no_username',
            accountCreated: false,
        };

        if (newResident.username) {
            const { rows: existing } = await query(
                'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
                [newResident.username]
            );
            if (existing.length === 0) {
                await query(
                    `INSERT INTO users (name, username, email, password, role, mobile_number, must_change_password)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [
                        `${newResident.firstName} ${newResident.lastName}`,
                        newResident.username,
                        newResident.email || '',
                        hashedPassword,
                        'resident',
                        newResident.mobileNumber || '',
                        true,
                    ]
                );
                account.accountCreated = true;
                const sms = await sendResidentWelcomeSms(newResident.mobileNumber, plainPassword);
                account = {
                    username: newResident.username,
                    smsSent: sms.sent,
                    smsReason: sms.sent ? '' : (sms.reason || 'send_failed'),
                    accountCreated: true,
                    tempPassword: plainPassword,
                };
                console.log(`[SMS] resident create ${newResident.username}:`, JSON.stringify(sms));
            } else {
                account = {
                    username: newResident.username,
                    smsSent: false,
                    smsReason: 'username_exists',
                    accountCreated: false,
                };
            }
        }

        return NextResponse.json({ success: true, resident: newResident, account }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
