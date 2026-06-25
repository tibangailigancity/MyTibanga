import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { generateRandomPassword } from '@/lib/generatePassword';
import { sendResidentWelcomeSms } from '@/lib/residentWelcomeSms';

/** Issue a new temporary portal password for a resident (create or refresh login account). */
export async function POST(request, { params }) {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    try {
        const { id } = await params;
        const residentId = parseInt(id, 10);
        if (!Number.isFinite(residentId)) {
            return NextResponse.json({ error: 'Invalid resident id' }, { status: 400 });
        }

        const { rows } = await query(
            `SELECT id, first_name, last_name, username, email, mobile_number
             FROM residents WHERE id = $1 AND deleted_at IS NULL`,
            [residentId]
        );
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
        }

        const r = rows[0];
        const username = String(r.username || '').trim();
        if (!username) {
            return NextResponse.json(
                { error: 'Resident has no portal username. Save a username on the profile first.' },
                { status: 400 }
            );
        }

        const plainPassword = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        const displayName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Resident';

        await query('UPDATE residents SET password = $1 WHERE id = $2', [hashedPassword, residentId]);

        const { rows: existingUsers } = await query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
            [username]
        );

        if (existingUsers.length > 0) {
            await query(
                `UPDATE users
                 SET name = $1, username = $2, email = $3, password = $4,
                     mobile_number = $5, must_change_password = TRUE
                 WHERE id = $6`,
                [
                    displayName,
                    username,
                    r.email || '',
                    hashedPassword,
                    r.mobile_number || '',
                    existingUsers[0].id,
                ]
            );
        } else {
            await query(
                `INSERT INTO users (name, username, email, password, role, mobile_number, must_change_password)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    displayName,
                    username,
                    r.email || '',
                    hashedPassword,
                    'resident',
                    r.mobile_number || '',
                    true,
                ]
            );
        }

        const sms = await sendResidentWelcomeSms(r.mobile_number || '', plainPassword);

        return NextResponse.json({
            success: true,
            username,
            tempPassword: plainPassword,
            smsSent: sms.sent,
            smsReason: sms.sent ? '' : (sms.reason || ''),
            residentName: displayName,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message || 'Reset failed' }, { status: 500 });
    }
}
