'use client';

import PublicNavbar from '@/components/PublicNavbar';
import AdminBar from '@/components/AdminBar';
import Footer from '@/components/Footer';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MUST_CHANGE_ALLOWED = ['/profile', '/login'];

export default function PublicLayout({ children }) {
    const [isAdmin, setIsAdmin] = useState(false);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data?.authenticated && data.user?.role === 'admin') {
                    setIsAdmin(true);
                }
                if (data?.authenticated && data.user?.role === 'resident') {
                    setMustChangePassword(data.user.mustChangePassword === true);
                }
            })
            .catch(() => { });
    }, [pathname]);

    useEffect(() => {
        if (!mustChangePassword) return;
        const allowed = MUST_CHANGE_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        if (!allowed && pathname !== '/') {
            router.replace('/profile?mustChangePassword=1');
        }
    }, [mustChangePassword, pathname, router]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {isAdmin && <AdminBar />}
            <PublicNavbar />
            <main style={{ marginTop: isAdmin ? '112px' : '80px', padding: '2rem 0', flex: 1 }}>
                {children}
            </main>
            <Footer />
        </div>
    );
}
