'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function EditHomepagePage() {
    const router = useRouter();
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetch('/api/admin/homepage')
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data) setContent(data);
            })
            .catch(() => showToast('Failed to load homepage content', 'error'))
            .finally(() => setLoading(false));
    }, []);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // --- Field updaters ---
    const updateWelcome = (field, value) => {
        setContent((prev) => ({
            ...prev,
            welcome: { ...prev.welcome, [field]: value },
        }));
    };

    const updateSection = (section, field, value) => {
        setContent((prev) => ({
            ...prev,
            [section]: { ...prev[section], [field]: value },
        }));
    };

    const updateCard = (section, index, field, value) => {
        setContent((prev) => ({
            ...prev,
            [section]: {
                ...prev[section],
                cards: prev[section].cards.map((card, i) =>
                    i === index ? { ...card, [field]: value } : card
                ),
            },
        }));
    };

    // --- Save ---
    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/homepage', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(content),
            });
            const data = await res.json();
            if (data.success) {
                showToast('Homepage content saved!');
            } else {
                showToast(data.error || 'Failed to save', 'error');
            }
        } catch {
            showToast('Network error', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={styles.loadingState}>Loading homepage content…</div>;
    if (!content) return <div className={styles.loadingState}>Failed to load content.</div>;

    return (
        <div className={styles.editor}>
            {/* Page Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Edit Homepage</h1>
                    <p className={styles.pageSubtitle}>
                        Edit the text content shown on the public homepage
                    </p>
                </div>
            </div>

            {/* ── Welcome Section ── */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>🏠</span>
                    <h3 className={styles.sectionTitle}>Welcome Section</h3>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Subtitle</label>
                    <input
                        className={styles.formInput}
                        value={content.welcome.subtitle}
                        onChange={(e) => updateWelcome('subtitle', e.target.value)}
                        placeholder="e.g. The Official Website of Barangay Tibanga"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>New Here Text</label>
                    <input
                        className={styles.formInput}
                        value={content.welcome.newHereText}
                        onChange={(e) => updateWelcome('newHereText', e.target.value)}
                        placeholder="e.g. **New Here?** Go to our Barangay Office…"
                    />
                    <span className={styles.formHint}>
                        Wrap text in **double asterisks** to make it bold on the homepage
                    </span>
                </div>
            </div>

            {/* ── About Section ── */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>ℹ️</span>
                    <h3 className={styles.sectionTitle}>About Section</h3>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Heading</label>
                    <input
                        className={styles.formInput}
                        value={content.about.heading}
                        onChange={(e) => updateSection('about', 'heading', e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Description</label>
                    <textarea
                        className={styles.formTextarea}
                        value={content.about.description}
                        onChange={(e) => updateSection('about', 'description', e.target.value)}
                    />
                </div>

                <label className={styles.formLabel}>Cards</label>
                <div className={styles.cardsGrid}>
                    {content.about.cards.map((card, i) => (
                        <div key={i} className={styles.cardItem}>
                            <div className={styles.cardItemHeader}>
                                <span className={styles.cardNumber}>{i + 1}</span>
                                <span className={styles.cardItemTitle}>Card {i + 1}</span>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Title</label>
                                <input
                                    className={styles.formInput}
                                    value={card.title}
                                    onChange={(e) => updateCard('about', i, 'title', e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                <label className={styles.formLabel}>Description</label>
                                <textarea
                                    className={styles.formTextarea}
                                    value={card.description}
                                    onChange={(e) => updateCard('about', i, 'description', e.target.value)}
                                    style={{ minHeight: 70 }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Services Section ── */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>⚙️</span>
                    <h3 className={styles.sectionTitle}>Services Section</h3>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Heading</label>
                    <input
                        className={styles.formInput}
                        value={content.services.heading}
                        onChange={(e) => updateSection('services', 'heading', e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Description</label>
                    <textarea
                        className={styles.formTextarea}
                        value={content.services.description}
                        onChange={(e) => updateSection('services', 'description', e.target.value)}
                    />
                </div>

                <label className={styles.formLabel}>Cards</label>
                <div className={styles.cardsGrid}>
                    {content.services.cards.map((card, i) => (
                        <div key={i} className={styles.cardItem}>
                            <div className={styles.cardItemHeader}>
                                <span className={styles.cardNumber}>{i + 1}</span>
                                <span className={styles.cardItemTitle}>Card {i + 1}</span>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Title</label>
                                <input
                                    className={styles.formInput}
                                    value={card.title}
                                    onChange={(e) => updateCard('services', i, 'title', e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                <label className={styles.formLabel}>Description</label>
                                <textarea
                                    className={styles.formTextarea}
                                    value={card.description}
                                    onChange={(e) => updateCard('services', i, 'description', e.target.value)}
                                    style={{ minHeight: 70 }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Save / Cancel ── */}
            <div className={styles.btnRow}>
                <button
                    className={styles.btnPrimary}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                    className={styles.btnSecondary}
                    onClick={() => router.push('/')}
                >
                    View Homepage
                </button>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
