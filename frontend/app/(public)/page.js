'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import TimeDisplay from '@/components/TimeDisplay';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import ActionLink from './components/ActionLink';
import { usePolling } from '@/hooks/usePolling';
import styles from './page.module.css';

export default function HomePage() {
    const [content, setContent] = useState(null);
    const [announcements, setAnnouncements] = useState([]);

    const fetchContent = useCallback(() => {
        fetch('/api/admin/homepage')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => { if (data) setContent(data); })
            .catch(() => { });
    }, []);

    const fetchAnnouncements = useCallback(() => {
        fetch('/api/announcements')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.announcements) setAnnouncements(data.announcements);
            })
            .catch(() => { });
    }, []);

    useEffect(() => { fetchContent(); }, [fetchContent]);
    useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);
    usePolling(fetchContent, 15000);
    usePolling(fetchAnnouncements, 15000);

    // Fallback while loading
    if (!content) {
        return (
            <section id="home" className={styles.homeSection}>
                <TimeDisplay />
                <div className={styles.welcomeSection}>
                    <div className={styles.welcomeText}>Welcome to</div>
                    <h1 className={styles.mainTitle}>
                        <span className={styles.titleMy}>My</span>
                        <span className={styles.titleTibanga}>Tibanga</span>
                        <span className={styles.titlePortal}>Portal</span>
                    </h1>
                    <p className={styles.subtitle}>Loading…</p>
                </div>
            </section>
        );
    }

    // Parse bold markdown in newHereText (e.g. **New Here?**)
    const renderNewHere = (text) => {
        const parts = text.split(/\*\*(.*?)\*\*/);
        return parts.map((part, i) =>
            i % 2 === 1 ? <strong key={i}>{part}</strong> : part
        );
    };

    return (
        <>
            {/* Home Section */}
            <section id="home" className={styles.homeSection}>
                <TimeDisplay />

                {/* Welcome */}
                <div className={styles.welcomeSection}>
                    <div className={styles.welcomeText}>Welcome to</div>
                    <h1 className={styles.mainTitle}>
                        <span className={styles.titleMy}>My</span>
                        <span className={styles.titleTibanga}>Tibanga</span>
                        <span className={styles.titlePortal}>Portal</span>
                    </h1>
                    <p className={styles.subtitle}>
                        {content.welcome.subtitle}
                    </p>
                </div>

                {/* Action Buttons */}
                <div className={styles.actionSection}>
                    <div className={styles.actionContainer}>
                        <div className={styles.actionItem}>
                            <ActionLink />
                        </div>
                        <div className={styles.actionItem}>
                            <p className={styles.newUserText}>
                                {renderNewHere(content.welcome.newHereText)}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Announcement Banner — data from System Settings → Announcements */}
            <AnnouncementBanner announcements={announcements} />

            {/* About Section */}
            <section id="about" className={styles.contentSection}>
                <h2>{content.about.heading}</h2>
                <p>{content.about.description}</p>
                <div className={styles.servicesGrid}>
                    {content.about.cards.map((card, i) => (
                        <div key={i} className={styles.serviceCard}>
                            <h3>{card.title}</h3>
                            <p>{card.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Services Section */}
            <section id="services" className={`${styles.contentSection} ${styles.noBottomGap}`}>
                <h2>{content.services.heading}</h2>
                <p>{content.services.description}</p>
                <div className={styles.servicesGrid}>
                    {content.services.cards.map((card, i) => (
                        <div key={i} className={styles.serviceCard}>
                            <h3>{card.title}</h3>
                            <p>{card.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Map Strip */}
            <section id="location" className={styles.mapSection}>
                <div className={styles.mapContainer}>
                    <iframe
                        title="Barangay Tibanga Map"
                        src="https://www.google.com/maps?q=Barangay+Tibanga+Iligan+City&output=embed"
                        className={styles.mapEmbed}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        allowFullScreen
                    />
                </div>
            </section>
        </>
    );
}
