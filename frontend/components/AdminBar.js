'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AdminBar.module.css';

export default function AdminBar() {
    const pathname = usePathname();
    const [user, setUser] = useState(null);

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data?.authenticated && data.user?.role === 'admin') {
                    setUser(data.user);
                }
            })
            .catch(() => { });
    }, [pathname]);

    if (!user) return null;

    return (
        <div className={styles.adminBar}>
            <div className={styles.barInner}>
                <div className={styles.barLeft}>
                    <Link href="/admin-dashboard" className={styles.barLink}>
                        <span className={styles.dashIcon}>⌂</span>
                        Dashboard
                    </Link>
                    <Link href="/edit-homepage" className={styles.barLink}>
                        <span className={styles.dashIcon}>✎</span>
                        Edit Page
                    </Link>
                </div>
                <div className={styles.barRight}>
                    <span className={styles.barGreeting}>Howdy, {user.name}</span>
                </div>
            </div>
        </div>
    );
}
