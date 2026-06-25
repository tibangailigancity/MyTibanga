'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../page.module.css';

export default function ActionLink() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data?.authenticated) setIsLoggedIn(true);
            })
            .catch(() => { });
    }, []);

    return (
        <Link
            href={isLoggedIn ? '/document-request' : '/login'}
            className={styles.documentRequestLink}
        >
            {isLoggedIn ? 'Request a Document? Click here' : 'Click here to Login'}
        </Link>
    );
}
