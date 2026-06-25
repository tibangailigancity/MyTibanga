import { NextResponse } from 'next/server';
import { getSession, refreshSession } from '@/lib/auth';
import { query } from '@/lib/db';

// GET — get current user's profile
export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [session.id]);
    const user = userRows[0];

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Also try to find the full resident record
    const { rows: resRows } = await query(
        `SELECT * FROM residents
         WHERE deleted_at IS NULL
           AND (username = $1 OR email = $2 OR (first_name || ' ' || last_name) = $3)`,
        [user.username, user.email, user.name]
    );
    const r = resRows[0];
    const resident = r ? {
        id: r.id, firstName: r.first_name, middleName: r.middle_name, lastName: r.last_name,
        suffix: r.suffix, sex: r.sex, civilStatus: r.civil_status, birthdate: r.birthdate,
        birthplace: r.birthplace, religion: r.religion, soloParent: r.solo_parent === true, citizenship: r.citizenship,
        purok: r.purok, barangay: r.barangay, city: r.city, mobileNumber: r.mobile_number,
        email: r.email,         mothersMaidenName: r.mothers_maiden_name, fathersName: r.fathers_name,
        spousesName: r.spouses_name,
        motherDeceased: r.mother_deceased === true,
        fatherDeceased: r.father_deceased === true,
        spouseDeceased: r.spouse_deceased === true,
        children: r.children || [], childrenAges: r.children_ages || [],
        username: r.username, idPicture: r.id_picture,
    } : null;

    return NextResponse.json({
        user: {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email || '',
            mobileNumber: user.mobile_number || '',
            role: user.role,
            mustChangePassword: user.must_change_password === true,
        },
        resident,
    });
}

// PATCH — update current user's profile
export async function PATCH(request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, mobileNumber, idPicture, currentPassword, newPassword } = body;

    const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [session.id]);
    const user = userRows[0];

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update basic info
    if (name) await query('UPDATE users SET name = $1 WHERE id = $2', [name, session.id]);
    if (email !== undefined) await query('UPDATE users SET email = $1 WHERE id = $2', [email, session.id]);
    if (mobileNumber !== undefined) await query('UPDATE users SET mobile_number = $1 WHERE id = $2', [mobileNumber, session.id]);

    // Password change
    if (newPassword) {
        const trimmed = String(newPassword).trim();
        if (trimmed.length < 6) {
            return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
        }

        const bcrypt = (await import('bcryptjs')).default;

        let valid = false;
        if (user.password.startsWith('$2')) {
            valid = await bcrypt.compare(currentPassword, user.password);
        } else {
            valid = currentPassword === user.password;
        }

        if (!valid) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
        }

        const hashed = await bcrypt.hash(trimmed, 10);
        await query(
            'UPDATE users SET password = $1, must_change_password = FALSE WHERE id = $2',
            [hashed, session.id]
        );

        const { rows: resRows } = await query(
            `SELECT id FROM residents
             WHERE deleted_at IS NULL
               AND (username = $1 OR (first_name || ' ' || last_name) = $2)`,
            [user.username, user.name]
        );
        if (resRows.length > 0) {
            await query('UPDATE residents SET password = $1 WHERE id = $2', [hashed, resRows[0].id]);
        }

        await refreshSession(session.id);
        return NextResponse.json({ success: true, mustChangePassword: false });
    }

    // Also update resident record if exists
    const { rows: resRows } = await query(
        `SELECT id FROM residents
         WHERE deleted_at IS NULL
           AND (username = $1 OR (first_name || ' ' || last_name) = $2)`,
        [user.username, session.name]
    );

    if (resRows.length > 0) {
        const residentId = resRows[0].id;
        if (email !== undefined) await query('UPDATE residents SET email = $1 WHERE id = $2', [email, residentId]);
        if (mobileNumber !== undefined) await query('UPDATE residents SET mobile_number = $1 WHERE id = $2', [mobileNumber, residentId]);
        if (idPicture !== undefined) await query('UPDATE residents SET id_picture = $1 WHERE id = $2', [idPicture, residentId]);
    }

    return NextResponse.json({ success: true });
}
