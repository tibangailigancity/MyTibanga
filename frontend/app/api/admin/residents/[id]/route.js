import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth';
import { normalizeChildrenArrays } from '@/lib/residentChildren';
import { validateSoloParentSector } from '@/lib/residentValidation';

// Helper to convert a DB row to camelCase
function toCamel(r) {
    return {
        id: r.id, firstName: r.first_name, middleName: r.middle_name, lastName: r.last_name,
        suffix: r.suffix, sex: r.sex, civilStatus: r.civil_status, birthdate: r.birthdate,
        birthplace: r.birthplace, religion: r.religion, household: r.household, housingStatus: r.housing_status, sector: r.sector || '', soloParent: r.solo_parent === true, citizenship: r.citizenship,
        purok: r.purok, barangay: r.barangay, city: r.city, mobileNumber: r.mobile_number,
        email: r.email, mothersMaidenName: r.mothers_maiden_name, fathersName: r.fathers_name,
        spousesName: r.spouses_name,
        motherDeceased: r.mother_deceased === true,
        fatherDeceased: r.father_deceased === true,
        spouseDeceased: r.spouse_deceased === true,
        childsName: r.childs_name, childsMother: r.childs_mother,
        children: r.children || [], childrenAges: r.children_ages || [],
        username: r.username, password: '', idPicture: r.id_picture,
    };
}

// GET — return a single resident
export async function GET(request, { params }) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const { id } = await params;
    const { rows } = await query('SELECT * FROM residents WHERE id = $1 AND deleted_at IS NULL', [parseInt(id)]);

    if (rows.length === 0) {
        return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
    }

    const resident = toCamel(rows[0]);
    let householdMembers = [];

    if (resident.household) {
        const { rows: memberRows } = await query(
            `SELECT id, first_name, last_name
             FROM residents
             WHERE household = $1
               AND id <> $2
               AND deleted_at IS NULL
             ORDER BY first_name, last_name`,
            [resident.household, resident.id]
        );
        householdMembers = memberRows.map((m) => ({
            id: m.id,
            firstName: m.first_name,
            lastName: m.last_name,
        }));
    }

    return NextResponse.json({ resident, householdMembers });
}

// PUT — update a resident
export async function PUT(request, { params }) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { id } = await params;
        const body = await request.json();
        const residentId = parseInt(id);
        let nextHashedPassword = null;

        const { rows: currentRows } = await query(
            'SELECT id, first_name, last_name, username, email, password, sector, children FROM residents WHERE id = $1 AND deleted_at IS NULL',
            [residentId]
        );
        if (currentRows.length === 0) {
            return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
        }
        const currentResident = currentRows[0];

        // Build SET clause dynamically from body keys
        // Map camelCase keys from frontend to snake_case DB columns
        const keyMap = {
            firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name',
            suffix: 'suffix', sex: 'sex', civilStatus: 'civil_status', birthdate: 'birthdate',
            birthplace: 'birthplace', religion: 'religion', household: 'household', housingStatus: 'housing_status', sector: 'sector', soloParent: 'solo_parent', citizenship: 'citizenship',
            purok: 'purok', barangay: 'barangay', city: 'city', mobileNumber: 'mobile_number',
            email: 'email', mothersMaidenName: 'mothers_maiden_name', fathersName: 'fathers_name',
            spousesName: 'spouses_name',
            motherDeceased: 'mother_deceased', fatherDeceased: 'father_deceased', spouseDeceased: 'spouse_deceased',
            childsName: 'childs_name', childsMother: 'childs_mother',
            children: 'children', childrenAges: 'children_ages', username: 'username', password: 'password', idPicture: 'id_picture',
        };

        const merged = { ...body };
        if (body.children !== undefined || body.childrenAges !== undefined) {
            const n = normalizeChildrenArrays(
                Array.isArray(body.children) ? body.children : [],
                Array.isArray(body.childrenAges) ? body.childrenAges : []
            );
            merged.children = n.children;
            merged.childrenAges = n.childrenAges;
        }
        if (body.sector !== undefined) {
            merged.soloParent = String(body.sector || '').trim() === 'Solo parent';
        }

        const effectiveSector = body.sector !== undefined
            ? String(body.sector || '').trim()
            : String(currentResident.sector || '').trim();
        const effectiveChildren = merged.children !== undefined
            ? merged.children
            : (currentResident.children || []);
        const soloErr = validateSoloParentSector(effectiveSector, effectiveChildren);
        if (soloErr) {
            return NextResponse.json({ error: soloErr }, { status: 400 });
        }

        const sets = [];
        const values = [];
        let paramIdx = 1;

        for (const [jsKey, dbCol] of Object.entries(keyMap)) {
            if (merged[jsKey] === undefined) continue;
            let val = merged[jsKey];
            if (jsKey === 'motherDeceased' || jsKey === 'fatherDeceased' || jsKey === 'spouseDeceased' || jsKey === 'soloParent') {
                val = !!val;
            }
            if (jsKey === 'password') {
                const raw = String(val || '');
                // Empty password means "do not change password".
                if (!raw.trim()) continue;
                // If UI accidentally sends the same stored hash, ignore it to avoid rehash loops.
                if (raw === String(currentResident.password || '')) continue;
                val = await bcrypt.hash(raw, 10);
                nextHashedPassword = val;
            }
            sets.push(`${dbCol} = $${paramIdx}`);
            values.push(val);
            paramIdx++;
        }

        if (sets.length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        values.push(residentId);
        const { rows, rowCount } = await query(
            `UPDATE residents SET ${sets.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`,
            values
        );

        if (rowCount === 0) {
            return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
        }

        // Sync resident login account in users table so username/password edits
        // made in Resident Records do not break subsequent sign-ins.
        const updatedRow = rows[0];
        const updated = toCamel(updatedRow);
        const oldUsername = String(currentResident.username || '').trim();
        const newUsername = String(updated.username || '').trim();
        const displayName = `${updated.firstName || ''} ${updated.lastName || ''}`.trim() || 'Resident';
        const syncedPassword = nextHashedPassword || updatedRow.password || currentResident.password || '';
        if (newUsername) {
            const { rows: existingUsers } = await query(
                'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
                [oldUsername || newUsername]
            );
            const userId = existingUsers[0]?.id;
            if (userId) {
                const updates = ['name = $1', 'username = $2', 'email = $3'];
                const vals = [displayName, newUsername, updated.email || ''];
                if (nextHashedPassword) {
                    updates.push(`password = $${updates.length + 1}`);
                    vals.push(nextHashedPassword);
                }
                vals.push(userId);
                await query(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = $${vals.length}`,
                    vals
                );
            } else {
                await query(
                    `INSERT INTO users (name, username, email, password, role)
                     VALUES ($1, $2, $3, $4, 'resident')`,
                    [displayName, newUsername, updated.email || '', syncedPassword || await bcrypt.hash('1234', 10)]
                );
            }
        }

        return NextResponse.json({ success: true, resident: updated });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE — soft delete resident (recoverable archive)
export async function DELETE(request, { params }) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { id } = await params;
        const pid = parseInt(id);
        const body = await request.json().catch(() => ({}));
        const reason = String(body.reason || '').trim();
        if (reason.length < 3) {
            return NextResponse.json(
                { error: 'Archive reason is required (at least 3 characters).' },
                { status: 400 }
            );
        }

        const { rows: resRows } = await query(
            'SELECT username, email FROM residents WHERE id = $1 AND deleted_at IS NULL',
            [pid]
        );
        if (resRows.length === 0) {
            return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
        }

        const { rowCount } = await query(
            'UPDATE residents SET deleted_at = NOW(), archive_reason = $1 WHERE id = $2 AND deleted_at IS NULL',
            [reason, pid]
        );
        if (rowCount === 0) {
            return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, softDeleted: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
