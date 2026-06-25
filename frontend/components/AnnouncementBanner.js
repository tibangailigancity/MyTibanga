'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './AnnouncementBanner.module.css';

export default function AnnouncementBanner({ announcements = [] }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const len = announcements.length;
    const hasMultiple = len > 1;

    useEffect(() => {
        setCurrentIndex((prev) => (len === 0 ? 0 : Math.min(prev, len - 1)));
    }, [len]);

    const next = useCallback(() => {
        if (len < 2) return;
        setCurrentIndex((prev) => (prev + 1) % len);
    }, [len]);

    const prev = useCallback(() => {
        if (len < 2) return;
        setCurrentIndex((prev) => (prev - 1 + len) % len);
    }, [len]);

    useEffect(() => {
        if (isPaused || len < 2) return;
        const interval = setInterval(next, 5000);
        return () => clearInterval(interval);
    }, [isPaused, next, len]);

    const displayText =
        len > 0
            ? announcements[currentIndex]
            : 'No announcements at this time. Check back later for barangay updates.';

    return (
        <section
            className={styles.banner}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            aria-label="Announcements"
        >
            <div className={styles.left}>
                <h2>Announcements</h2>
            </div>
            <div className={styles.right}>
                <p className={styles.text} role="status" aria-live="polite">
                    {displayText}
                </p>
                {hasMultiple && (
                    <div className={styles.controls}>
                        <button
                            type="button"
                            className={styles.btn}
                            onClick={prev}
                            aria-label="Previous announcement"
                        >
                            ‹
                        </button>
                        <button
                            type="button"
                            className={styles.btn}
                            onClick={next}
                            aria-label="Next announcement"
                        >
                            ›
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
