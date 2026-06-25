'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import TimeDisplay from '@/components/TimeDisplay';
import ConfirmDialog from '@/components/ConfirmDialog';
import styles from './layout.module.css';

const SIDEBAR_LINKS = [
    { href: '/admin-dashboard', label: 'Dashboard', icon: '⌂' },
    { href: '/resident-records', label: 'Resident Records', icon: '☷' },
    { href: '/document-management', label: 'Document Management', icon: '▤' },
    { href: '/request-history', label: 'Request History', icon: '☰' },
    { href: '/reports', label: 'Reports', icon: '✎' },
    { href: '/system-settings', label: 'System Settings', icon: '⚙' },
];

/** Extra admin routes not in the sidebar — warm them so first click does not wait on Turbopack. */
const EXTRA_PREFETCH = ['/edit-homepage', '/resident-records/add'];

export default function AdminLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const dropdownRef = useRef(null);

    const openLogoutConfirm = () => {
        setDropdownOpen(false);
        setLogoutDialogOpen(true);
    };

    const performLogout = async () => {
        setLogoutDialogOpen(false);
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const updateViewportState = () => {
            const mobile = window.innerWidth <= 1024;
            setIsMobile(mobile);
            setSidebarOpen(!mobile);
        };
        updateViewportState();
        window.addEventListener('resize', updateViewportState);
        return () => window.removeEventListener('resize', updateViewportState);
    }, []);

    // In dev, Turbopack compiles each admin page on first visit — prefetch all common routes in idle time
    // so sidebar navigation feels instant after the initial warm-up.
    useEffect(() => {
        const hrefs = [...SIDEBAR_LINKS.map((l) => l.href), ...EXTRA_PREFETCH];
        let cancelled = false;
        const warm = () => {
            for (const href of hrefs) {
                if (cancelled) return;
                router.prefetch(href);
            }
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const id = window.requestIdleCallback(warm, { timeout: 2500 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(id);
            };
        }
        const t = window.setTimeout(warm, 400);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [router]);

    // Get dynamic greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    return (
        <div className={styles.adminWrapper}>
            <ConfirmDialog
                open={logoutDialogOpen}
                title="Log out?"
                message="You will need to sign in again to access the admin dashboard."
                confirmLabel="Log out"
                cancelLabel="Cancel"
                confirmVariant="primary"
                onConfirm={performLogout}
                onCancel={() => setLogoutDialogOpen(false)}
            />
            {/* Top Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/" className={styles.logo}>
                        <span className={styles.logoMy}>My</span>
                        <span className={styles.logoTibanga}>Tibanga</span>
                        <span className={styles.logoPortal}>Portal</span>
                    </Link>
                    <button
                        className={styles.menuToggle}
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label="Toggle sidebar"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                </div>

                <nav className={styles.headerNav}>
                    <Link href="/" className={styles.headerNavLink}>Home</Link>
                    <Link href="/#about" className={styles.headerNavLink}>About</Link>
                    <span className={`${styles.headerNavLink} ${styles.activeHeaderLink}`}>Admin Services</span>
                </nav>

                <div className={styles.headerRight} ref={dropdownRef}>
                    <button
                        className={styles.adminBtn}
                        onClick={() => setDropdownOpen((prev) => !prev)}
                    >
                        <span className={styles.adminLabel}>Admin</span>
                        <div className={styles.adminAvatar}></div>
                    </button>
                    {dropdownOpen && (
                        <div className={styles.headerDropdown}>
                            <Link href="/system-settings" className={styles.headerDropdownLink} onClick={() => setDropdownOpen(false)}>
                                Update Profile
                            </Link>
                            <button className={styles.headerDropdownItem} onClick={openLogoutConfirm}>
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className={styles.contentWrapper}>
                {/* Sidebar */}
                <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''} ${!sidebarOpen ? styles.sidebarCollapsed : ''}`}>
                    <div className={styles.sidebarWelcome}>
                        <h2 className={styles.welcomeGreeting}>Hello Admin</h2>
                        <h3 className={styles.welcomeName}>{user?.name || 'Juan Dela Cruz'}!</h3>
                    </div>

                    <nav className={styles.sidebarNav}>
                        {SIDEBAR_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`${styles.sidebarLink} ${pathname === link.href || pathname?.startsWith(link.href + '/') ? styles.sidebarLinkActive : ''}`}
                            >
                                <span className={styles.sidebarIcon}>{link.icon}</span>
                                {link.label}
                            </Link>
                        ))}
                        <button className={styles.sidebarLogout} onClick={openLogoutConfirm}>
                            <span className={styles.sidebarIcon}>⏻</span>
                            Logout
                        </button>
                    </nav>
                </aside>

                {/* Backdrop for mobile */}
                {sidebarOpen && isMobile && (
                    <div
                        className={styles.backdrop}
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Main Content */}
                <main className={`${styles.mainContent} ${!sidebarOpen ? styles.mainContentExpanded : ''}`}>
                    <TimeDisplay />
                    {children}
                </main>
            </div>
        </div>
    );
}
