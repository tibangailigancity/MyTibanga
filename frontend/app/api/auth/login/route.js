import { findUserByUsername, verifyPassword, createSession } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { username, password, adminPortal = false } = await request.json();

        // Validate input
        if (!username || !password) {
            return NextResponse.json(
                { success: false, message: 'Username and password are required' },
                { status: 400 }
            );
        }

        // Find user by username (now reads from PostgreSQL)
        const user = await findUserByUsername(username);
        if (!user) {
            return NextResponse.json(
                { success: false, message: 'Invalid username or password' },
                { status: 401 }
            );
        }

        const isAdmin = user.role === 'admin';
        if (isAdmin !== !!adminPortal) {
            return NextResponse.json(
                { success: false, message: 'Invalid username or password' },
                { status: 401 }
            );
        }

        // Verify password
        const valid = await verifyPassword(password, user.password, user);
        if (!valid) {
            return NextResponse.json(
                { success: false, message: 'Invalid username or password' },
                { status: 401 }
            );
        }

        // Create session
        await createSession(user);

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
                mustChangePassword: user.mustChangePassword === true,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { success: false, message: 'An error occurred during login' },
            { status: 500 }
        );
    }
}
