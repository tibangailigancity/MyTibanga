'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePolling } from '@/hooks/usePolling';
import ConfirmDialog from '@/components/ConfirmDialog';
import styles from './PublicNavbar.module.css';

const NAV_LINKS = [
    { href: '/', label: 'Home', section: 'home' },
    { href: '/#about', label: 'About', section: 'about' },
    { href: '/#services', label: 'Services', section: 'services' },
];

/** Must match `.contentSection { scroll-margin-top }` in app/(public)/page.module.css so scroll-spy agrees with hash scroll. */
const CONTENT_SECTION_SCROLL_MARGIN_PX = 100;

/** Ignore scroll-spy while smooth-scrolling to a clicked anchor (avoids Home → About → Home flicker). */
const NAV_CLICK_LOCK_MS = 650;

export default function PublicNavbar() {
    const pathname = usePathname();
    const [activeSection, setActiveSection] = useState('home');
    const [user, setUser] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [notifCount, setNotifCount] = useState(0);
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navAnchorLockRef = useRef({ until: 0, section: null });

    // Check auth status
    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data?.authenticated) setUser(data.user);
            })
            .catch(() => { });
    }, [pathname]);

    // Fetch notification count (requests with admin notes)
    const fetchNotifCount = useCallback(() => {
        if (!user) return;
        fetch('/api/requests/my', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                const count = (data.requests || []).filter(r => r.adminNotes).length;
                setNotifCount(count);
            })
            .catch(() => {});
    }, [user]);

    useEffect(() => { fetchNotifCount(); }, [fetchNotifCount, pathname]);
    usePolling(fetchNotifCount, 10000, !!user);

    // Scroll spy: highlight the section whose top has passed the "reading line" below the fixed nav.
    // IntersectionObserver alone missed #about / #services because they mount after homepage JSON loads.
    const updateActiveFromScroll = useCallback(() => {
        if (pathname !== '/') return;

        const lock = navAnchorLockRef.current;
        if (Date.now() < lock.until && lock.section && NAV_LINKS.some((l) => l.section === lock.section)) {
            setActiveSection((prev) => (prev === lock.section ? prev : lock.section));
            return;
        }

        const main = document.querySelector('main');
        const navOffset = main ? parseFloat(getComputedStyle(main).marginTop) || 80 : 80;
        const triggerY = Math.max(navOffset + 8, CONTENT_SECTION_SCROLL_MARGIN_PX);

        // If the URL hash points at a nav section and that section is still in the "focus" part of the
        // viewport, trust the hash. Otherwise scroll-spy overwrites e.g. /#services with "About"
        // (geometry + scroll-margin makes the last "top <= trigger" section wrong for anchored scroll).
        const hashId = window.location.hash.replace(/^#/, '');
        if (hashId && NAV_LINKS.some((l) => l.section === hashId)) {
            const hashEl = document.getElementById(hashId);
            if (hashEl) {
                const r = hashEl.getBoundingClientRect();
                const vh = window.innerHeight;
                const navPad = navOffset + 16;
                const hashSectionInFocus = r.bottom > navPad && r.top < vh * 0.65;
                if (hashSectionInFocus) {
                    setActiveSection((prev) => (prev === hashId ? prev : hashId));
                    return;
                }
            }
        }

        const ids = NAV_LINKS.map((l) => l.section);
        let next = 'home';
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (el.getBoundingClientRect().top <= triggerY) next = id;
        }
        setActiveSection((prev) => (prev === next ? prev : next));
    }, [pathname]);

    useEffect(() => {
        if (pathname !== '/') return;

        let raf = 0;
        const onScrollOrResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateActiveFromScroll);
        };

        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });

        updateActiveFromScroll();
        const retryMs = [100, 250, 500, 1000, 2000];
        const timeouts = retryMs.map((ms) => window.setTimeout(updateActiveFromScroll, ms));

        return () => {
            window.removeEventListener('scroll', onScrollOrResize);
            window.removeEventListener('resize', onScrollOrResize);
            cancelAnimationFrame(raf);
            timeouts.forEach(clearTimeout);
        };
    }, [pathname, updateActiveFromScroll]);

    const syncActiveFromHash = useCallback(() => {
        if (pathname !== '/') {
            setActiveSection('home');
            return;
        }
        const hash = window.location.hash.replace('#', '');
        setActiveSection(hash || 'home');
    }, [pathname]);

    // Sync active nav when route/hash changes.
    useEffect(() => {
        syncActiveFromHash();
    }, [syncActiveFromHash]);

    // Listen for hash changes.
    useEffect(() => {
        window.addEventListener('hashchange', syncActiveFromHash);
        return () => window.removeEventListener('hashchange', syncActiveFromHash);
    }, [syncActiveFromHash]);

    const isActive = (link) => {
        if (pathname !== '/') return false;
        return activeSection === link.section;
    };

    const handleNavClick = (e, link) => {
        if (pathname !== '/') return;
        e.preventDefault();

        const targetId = link.section;
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;

        navAnchorLockRef.current = { until: Date.now() + NAV_CLICK_LOCK_MS, section: targetId };
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Keep URL and active state in sync with the target section.
        window.history.replaceState(null, '', targetId === 'home' ? '/' : `/#${targetId}`);
        setActiveSection(targetId);
    };

    const openLogoutConfirm = () => {
        setDropdownOpen(false);
        setLogoutDialogOpen(true);
    };

    const performLogout = async () => {
        setLogoutDialogOpen(false);
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
        window.location.href = '/';
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className={styles.navbar} style={user?.role === 'admin' ? { top: '32px' } : undefined}>
            <ConfirmDialog
                open={logoutDialogOpen}
                title="Log out?"
                message="You will need to sign in again to access your requests and profile."
                confirmLabel="Log out"
                cancelLabel="Cancel"
                confirmVariant="primary"
                onConfirm={performLogout}
                onCancel={() => setLogoutDialogOpen(false)}
            />
            <div className={styles.navContainer}>
                <Link href="/" className={styles.logo}>
                    <span className={styles.logoMy}>My</span>
                    <span className={styles.logoTibanga}>Tibanga</span>
                    <span className={styles.logoPortal}>Portal</span>
                </Link>

                <nav className={styles.navMenu}>
                    <ul>
                        {NAV_LINKS.map((link) => (
                            <li key={link.href}>
                                <Link
                                    href={link.href}
                                    className={`${styles.navLink} ${isActive(link) ? styles.active : ''}`}
                                    onClick={(e) => handleNavClick(e, link)}
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className={styles.authSection}>
                    {user ? (
                        <div className={styles.userDropdown} ref={dropdownRef}>
                            <button
                                className={styles.userNameBtn}
                                onClick={() => setDropdownOpen((prev) => !prev)}
                            >
                                {user.name}
                                {notifCount > 0 && (
                                    <span className={styles.dropdownBadge}>{notifCount}</span>
                                )}
                                <span className={`${styles.dropdownArrow} ${dropdownOpen ? styles.open : ''}`}>▾</span>
                            </button>
                            {dropdownOpen && (
                                <div className={styles.dropdownMenu}>
                                    <Link href="/profile" className={styles.dropdownItem} onClick={() => setDropdownOpen(false)}>
                                        Update Profile
                                    </Link>
                                    <Link href="/track-request" className={styles.dropdownItem} onClick={() => setDropdownOpen(false)}>
                                        Track Request
                                        {notifCount > 0 && (
                                            <span className={styles.dropdownBadge}>{notifCount}</span>
                                        )}
                                    </Link>
                                    <button className={styles.dropdownItem} onClick={openLogoutConfirm}>
                                        Log Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link href="/login" className={styles.loginBtn}>
                            Log In
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
