import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import {
    loadOrBooklet,
    orBookletSummary,
    OrBookletError,
    saveOrBooklet,
} from '@/lib/orBooklet';
import { DEFAULT_COMMON_PURPOSES, DEFAULT_DOCUMENT_REQUIREMENTS } from '@/lib/documentRequirements';

// Check if user is a super admin
function isSuperAdmin(user) {
    return user.super_admin === true;
}

// Check if user has a specific permission
function hasPermission(user, perm) {
    if (isSuperAdmin(user)) return true;
    return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

// GET — return all settings data
export async function GET() {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch current admin user
    const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [session.id]);
    const admin = userRows[0];

    // Fetch settings
    const { rows: feeRows } = await query("SELECT value FROM settings WHERE key = 'documentFees'");
    const { rows: purokRows } = await query("SELECT value FROM settings WHERE key = 'puroks'");
    const { rows: paymentRows } = await query("SELECT value FROM settings WHERE key = 'paymentConfig'");
    const { rows: expiryRows } = await query("SELECT value FROM settings WHERE key = 'pendingExpiryDays'");
    const { rows: cameraRows } = await query("SELECT value FROM settings WHERE key = 'cameraLoginEnabled'");
    const { rows: reqMapRows } = await query("SELECT value FROM settings WHERE key = 'documentRequirements'");
    const { rows: purposeRows } = await query("SELECT value FROM settings WHERE key = 'commonPurposes'");
    const orBooklet = orBookletSummary(await loadOrBooklet());
    const documentFees = feeRows[0]?.value || [];
    const puroks = purokRows[0]?.value || [];
    const pendingExpiryDaysRaw = expiryRows[0]?.value;
    const pendingExpiryDaysParsed = Number(
        typeof pendingExpiryDaysRaw === 'object' && pendingExpiryDaysRaw !== null && 'days' in pendingExpiryDaysRaw
            ? pendingExpiryDaysRaw.days
            : pendingExpiryDaysRaw
    );
    const pendingExpiryDays = Number.isFinite(pendingExpiryDaysParsed) && pendingExpiryDaysParsed > 0
        ? Math.floor(pendingExpiryDaysParsed)
        : 3;
    const cameraLoginRaw = cameraRows[0]?.value;
    const cameraLoginEnabled = typeof cameraLoginRaw === 'boolean'
        ? cameraLoginRaw
        : true;
    const documentRequirements =
        reqMapRows[0]?.value && typeof reqMapRows[0].value === 'object' && !Array.isArray(reqMapRows[0].value)
            ? reqMapRows[0].value
            : DEFAULT_DOCUMENT_REQUIREMENTS;
    const commonPurposes = Array.isArray(purposeRows[0]?.value) && purposeRows[0].value.length > 0
        ? purposeRows[0].value
        : DEFAULT_COMMON_PURPOSES;
    const rawPaymentConfig = paymentRows[0]?.value || {
        gcash: { accountName: 'Barangay Tibanga', accountNumber: '0900 000 0000', qrImageUrl: '' },
        bank: { bankName: 'LandBank', accountName: 'Barangay Tibanga', accountNumber: '0000-0000-0000' },
    };
    const paymentConfig = {
        ...rawPaymentConfig,
        onlinePaymentEnabled: rawPaymentConfig.onlinePaymentEnabled !== false,
    };

    // Fetch announcements (newest first)
    const { rows: announcements } = await query('SELECT * FROM announcements ORDER BY id DESC');
    // Convert to camelCase for frontend
    const announcementsList = announcements.map(a => ({
        id: a.id, title: a.title, content: a.content, date: a.date, dateModified: a.date_modified,
    }));

    // Determine user permissions
    const userIsSuperAdmin = admin && isSuperAdmin(admin);
    const userPermissions = userIsSuperAdmin
        ? ['fees', 'request-expiry', 'announcements', 'puroks', 'admin-management']
        : (admin?.permissions || []);

    // Build admin list for super admin
    let adminUsers = [];
    if (userIsSuperAdmin) {
        const { rows } = await query("SELECT * FROM users WHERE role = 'admin'");
        adminUsers = rows.map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            superAdmin: u.super_admin || false,
            permissions: u.permissions || [],
        }));
    }

    return NextResponse.json({
        profile: admin ? { id: admin.id, name: admin.name, email: admin.email, username: admin.username } : null,
        documentFees,
        paymentConfig,
        pendingExpiryDays,
        cameraLoginEnabled,
        puroks,
        announcements: announcementsList,
        permissions: userPermissions,
        isSuperAdmin: userIsSuperAdmin,
        adminUsers,
        orBooklet,
        documentRequirements,
        commonPurposes,
    });
}

// PATCH — update a specific section
export async function PATCH(request) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [session.id]);
    const currentUser = userRows[0];
    if (!currentUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { section } = body;

    // ── Profile ──
    if (section === 'profile') {
        const { name, email, currentPassword, newPassword } = body;

        if (name) await query('UPDATE users SET name = $1 WHERE id = $2', [name, session.id]);
        if (email !== undefined) await query('UPDATE users SET email = $1 WHERE id = $2', [email, session.id]);

        if (newPassword) {
            let valid = false;
            if (currentUser.password.startsWith('$2')) {
                valid = await bcrypt.compare(currentPassword, currentUser.password);
            } else {
                valid = currentPassword === currentUser.password;
            }
            if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
            const hashed = await bcrypt.hash(newPassword, 10);
            await query('UPDATE users SET password = $1 WHERE id = $2', [hashed, session.id]);
        }

        const { rows } = await query('SELECT id, name, email, username FROM users WHERE id = $1', [session.id]);
        return NextResponse.json({ success: true, profile: rows[0] });
    }

    // ── Document Fees ── (requires 'fees' permission)
    if (section === 'fees') {
        if (!hasPermission(currentUser, 'fees')) {
            return NextResponse.json({ error: 'No permission to edit fees' }, { status: 403 });
        }
        const { documentFees, paymentConfig } = body;
        await query(
            "INSERT INTO settings (key, value) VALUES ('documentFees', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(documentFees)]
        );
        if (paymentConfig && typeof paymentConfig === 'object') {
            await query(
                "INSERT INTO settings (key, value) VALUES ('paymentConfig', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [JSON.stringify(paymentConfig)]
            );
        }
        return NextResponse.json({ success: true, documentFees, paymentConfig });
    }

    // ── OR Booklet ── (requires 'fees' permission)
    if (section === 'or-booklet') {
        if (!hasPermission(currentUser, 'fees')) {
            return NextResponse.json({ error: 'No permission to edit OR booklet settings' }, { status: 403 });
        }
        try {
            const saved = await saveOrBooklet({
                nextOr: body.nextOr,
                endOr: body.endOr,
                notes: body.notes,
            });
            return NextResponse.json({ success: true, orBooklet: orBookletSummary(saved) });
        } catch (err) {
            const message = err instanceof OrBookletError ? err.message : 'Invalid OR booklet settings';
            return NextResponse.json({ error: message }, { status: 400 });
        }
    }

    // ── Request Expiry ── (requires 'request-expiry' or 'fees' permission)
    if (section === 'request-expiry') {
        if (!hasPermission(currentUser, 'request-expiry') && !hasPermission(currentUser, 'fees')) {
            return NextResponse.json({ error: 'No permission to edit request expiry settings' }, { status: 403 });
        }
        const days = Number(body.pendingExpiryDays);
        if (!Number.isFinite(days) || days < 1 || days > 365) {
            return NextResponse.json(
                { error: 'Pending expiry days must be a number between 1 and 365' },
                { status: 400 }
            );
        }
        const safeDays = Math.floor(days);
        await query(
            "INSERT INTO settings (key, value) VALUES ('pendingExpiryDays', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(safeDays)]
        );
        return NextResponse.json({ success: true, pendingExpiryDays: safeDays });
    }

    // ── Camera Login ── (super admin only)
    if (section === 'camera-login') {
        if (!isSuperAdmin(currentUser)) {
            return NextResponse.json({ error: 'Only super admin can change camera login setting' }, { status: 403 });
        }
        const cameraLoginEnabled = body.cameraLoginEnabled === false ? false : true;
        await query(
            "INSERT INTO settings (key, value) VALUES ('cameraLoginEnabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(cameraLoginEnabled)]
        );
        return NextResponse.json({ success: true, cameraLoginEnabled });
    }

    // ── Announcements ── (requires 'announcements' permission)
    if (section === 'announcements') {
        if (!hasPermission(currentUser, 'announcements')) {
            return NextResponse.json({ error: 'No permission to manage announcements' }, { status: 403 });
        }
        const { action, announcement } = body;

        if (action === 'add') {
            const now = new Date().toISOString();
            await query(
                'INSERT INTO announcements (title, content, date) VALUES ($1, $2, $3)',
                [announcement.title || '', announcement.content || '', now]
            );
            const { rows } = await query('SELECT * FROM announcements ORDER BY id DESC');
            const list = rows.map(a => ({ id: a.id, title: a.title, content: a.content, date: a.date, dateModified: a.date_modified }));
            return NextResponse.json({ success: true, announcements: list });
        }
        if (action === 'edit') {
            const now = new Date().toISOString();
            const { rowCount } = await query(
                'UPDATE announcements SET title = $1, content = $2, date_modified = $3 WHERE id = $4',
                [announcement.title, announcement.content, now, announcement.id]
            );
            if (rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            const { rows } = await query('SELECT * FROM announcements ORDER BY id DESC');
            const list = rows.map(a => ({ id: a.id, title: a.title, content: a.content, date: a.date, dateModified: a.date_modified }));
            return NextResponse.json({ success: true, announcements: list });
        }
        if (action === 'delete') {
            await query('DELETE FROM announcements WHERE id = $1', [announcement.id]);
            const { rows } = await query('SELECT * FROM announcements ORDER BY id DESC');
            const list = rows.map(a => ({ id: a.id, title: a.title, content: a.content, date: a.date, dateModified: a.date_modified }));
            return NextResponse.json({ success: true, announcements: list });
        }
    }

    // ── Puroks ── (requires 'puroks' permission)
    if (section === 'puroks') {
        if (!hasPermission(currentUser, 'puroks')) {
            return NextResponse.json({ error: 'No permission to manage puroks' }, { status: 403 });
        }
        const { action, purok, newName } = body;

        // Fetch current puroks
        const { rows: pRows } = await query("SELECT value FROM settings WHERE key = 'puroks'");
        let puroks = pRows[0]?.value || [];

        if (action === 'add') {
            if (puroks.includes(purok)) return NextResponse.json({ error: 'Already exists' }, { status: 400 });
            puroks.push(purok);
        }
        if (action === 'rename') {
            const idx = puroks.indexOf(purok);
            if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            puroks[idx] = newName;
        }
        if (action === 'delete') {
            puroks = puroks.filter((p) => p !== purok);
        }

        await query(
            "INSERT INTO settings (key, value) VALUES ('puroks', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(puroks)]
        );
        return NextResponse.json({ success: true, puroks });
    }

    // ── Admin Management ── (super admin only)
    if (section === 'admin-management') {
        if (!isSuperAdmin(currentUser)) {
            return NextResponse.json({ error: 'Only super admin can manage admins' }, { status: 403 });
        }

        const { action } = body;

        if (action === 'add') {
            const { name, username, email, password, permissions } = body;
            if (!name || !username || !password) {
                return NextResponse.json({ error: 'Name, username, and initial password are required' }, { status: 400 });
            }
            // Check for duplicate username
            const { rows: existing } = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
            if (existing.length > 0) {
                return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            await query(
                'INSERT INTO users (name, username, email, password, role, permissions) VALUES ($1,$2,$3,$4,$5,$6)',
                [name, username, email || '', hashedPassword, 'admin', permissions || []]
            );

            const { rows } = await query("SELECT * FROM users WHERE role = 'admin'");
            const adminUsers = rows.map((u) => ({ id: u.id, name: u.name, username: u.username, email: u.email, superAdmin: u.super_admin || false, permissions: u.permissions || [] }));
            return NextResponse.json({ success: true, adminUsers });
        }

        if (action === 'edit') {
            const { adminId, name, email, permissions, password } = body;
            const { rows: targetRows } = await query("SELECT * FROM users WHERE id = $1 AND role = 'admin'", [adminId]);
            if (targetRows.length === 0) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

            if (targetRows[0].super_admin) {
                return NextResponse.json({ error: 'Cannot modify super admin' }, { status: 400 });
            }

            if (name) await query('UPDATE users SET name = $1 WHERE id = $2', [name, adminId]);
            if (email !== undefined) await query('UPDATE users SET email = $1 WHERE id = $2', [email, adminId]);
            if (permissions) await query('UPDATE users SET permissions = $1 WHERE id = $2', [permissions, adminId]);
            if (password) {
                const hashed = await bcrypt.hash(password, 10);
                await query('UPDATE users SET password = $1 WHERE id = $2', [hashed, adminId]);
            }

            const { rows } = await query("SELECT * FROM users WHERE role = 'admin'");
            const adminUsers = rows.map((u) => ({ id: u.id, name: u.name, username: u.username, email: u.email, superAdmin: u.super_admin || false, permissions: u.permissions || [] }));
            return NextResponse.json({ success: true, adminUsers });
        }

        if (action === 'delete') {
            const { adminId } = body;
            const { rows: targetRows } = await query("SELECT * FROM users WHERE id = $1 AND role = 'admin'", [adminId]);
            if (targetRows.length === 0) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
            if (targetRows[0].super_admin) return NextResponse.json({ error: 'Cannot delete super admin' }, { status: 400 });

            await query('DELETE FROM users WHERE id = $1', [adminId]);

            const { rows } = await query("SELECT * FROM users WHERE role = 'admin'");
            const adminUsers = rows.map((u) => ({ id: u.id, name: u.name, username: u.username, email: u.email, superAdmin: u.super_admin || false, permissions: u.permissions || [] }));
            return NextResponse.json({ success: true, adminUsers });
        }
    }

    // ── Request config (purposes + per-document requirements) ──
    if (section === 'request-config') {
        if (!hasPermission(currentUser, 'fees')) {
            return NextResponse.json({ error: 'No permission to edit request settings' }, { status: 403 });
        }
        const { commonPurposes, documentRequirements } = body;
        if (Array.isArray(commonPurposes)) {
            await query(
                "INSERT INTO settings (key, value) VALUES ('commonPurposes', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [JSON.stringify(commonPurposes.filter(Boolean))]
            );
        }
        if (documentRequirements && typeof documentRequirements === 'object' && !Array.isArray(documentRequirements)) {
            await query(
                "INSERT INTO settings (key, value) VALUES ('documentRequirements', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
                [JSON.stringify(documentRequirements)]
            );
        }
        return NextResponse.json({ success: true, commonPurposes, documentRequirements });
    }

    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
}
