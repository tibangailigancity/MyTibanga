import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { extractDescriptor, findMatch } from '@/lib/faceRecognition';

export async function POST(request) {
    try {
        const { rows: cameraRows } = await query("SELECT value FROM settings WHERE key = 'cameraLoginEnabled'");
        const cameraLoginRaw = cameraRows[0]?.value;
        const cameraLoginEnabled = typeof cameraLoginRaw === 'boolean' ? cameraLoginRaw : true;
        if (!cameraLoginEnabled) {
            return NextResponse.json(
                { success: false, message: 'Camera login is currently disabled. Please use password login.' },
                { status: 403 }
            );
        }

        const { image } = await request.json();

        if (!image || typeof image !== 'string') {
            return NextResponse.json(
                { success: false, message: 'No image provided' },
                { status: 400 }
            );
        }

        // Extract face descriptor server-side
        const result = await extractDescriptor(image);
        if (result.error) {
            return NextResponse.json(
                { success: false, message: result.error },
                { status: 400 }
            );
        }

        // Fetch all enrolled admins
        const { rows } = await query(
            "SELECT id, name, username, email, role, super_admin, permissions, face_descriptor FROM users WHERE role = 'admin' AND face_descriptor IS NOT NULL"
        );

        if (rows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No admin faces enrolled. Please use password login.' },
                { status: 404 }
            );
        }

        // Find best match
        const match = findMatch(result.descriptor, rows);

        if (!match) {
            return NextResponse.json(
                { success: false, message: 'Face not recognized. Please try again or use password login.' },
                { status: 401 }
            );
        }

        const user = {
            id: match.admin.id,
            name: match.admin.name,
            username: match.admin.username,
            email: match.admin.email,
            role: match.admin.role,
            superAdmin: match.admin.super_admin,
            permissions: match.admin.permissions || [],
        };

        await createSession(user);

        return NextResponse.json({
            success: true,
            user: { id: user.id, name: user.name, username: user.username, role: user.role },
            confidence: match.confidence,
        });
    } catch (error) {
        console.error('Face login error:', error);
        return NextResponse.json(
            { success: false, message: 'An error occurred during face login' },
            { status: 500 }
        );
    }
}
