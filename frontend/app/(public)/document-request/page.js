'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TimeDisplay from '@/components/TimeDisplay';
import { useAuth } from '@/hooks/useAuth';
import { usePolling } from '@/hooks/usePolling';
import { getRequirementsForDocument } from '@/lib/documentRequirements';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import styles from './page.module.css';

export default function DocumentRequestPage() {
    const router = useRouter();
    const { showAlert, dialogs } = useAppDialogs();
    const { user } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState({});
    const [quantities, setQuantities] = useState({});
    const [previewIndex, setPreviewIndex] = useState(0);
    const [modalImage, setModalImage] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [documentRequirementsMap, setDocumentRequirementsMap] = useState({});

    // Fetch documents from the database
    const fetchDocuments = useCallback(async () => {
        try {
            const res = await fetch('/api/documents');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('Documents catalog error:', data.error || res.status);
                setDocuments([]);
                return;
            }
            const docs = (data.documents || []).map((doc) => ({
                id: String(doc.id),
                label: doc.name,
                image: doc.preview || '',
                requiresPurpose: doc.requiresPurpose === true,
            }));
            docs.sort((a, b) => a.label.localeCompare(b.label));
            setDocuments(docs);
        } catch (err) {
            console.error('Failed to fetch documents:', err);
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetch('/api/request-config')
            .then((r) => (r.ok ? r.json() : {}))
            .then((d) => {
                if (d.documentRequirements) setDocumentRequirementsMap(d.documentRequirements);
            })
            .catch(() => {});
    }, []);

    useEffect(() => { fetchDocuments(); }, [fetchDocuments]);
    // Document catalog changes infrequently; avoid aggressive refetch that can re-trigger image work.
    usePolling(fetchDocuments, 60000);

    // Warm the payment route while the user picks documents (Tesseract loads on demand there).
    useEffect(() => {
        router.prefetch('/payment');
    }, [router]);

    const selectedDocs = documents.filter((doc) => selected[doc.id]);
    const currentPreviewDoc = selectedDocs[previewIndex];
    const selectedRequirements = currentPreviewDoc
        ? getRequirementsForDocument(currentPreviewDoc.label, documentRequirementsMap)
        : [];

    const handleToggle = (docId) => {
        setSelected((prev) => {
            const next = { ...prev, [docId]: !prev[docId] };
            // Reset preview index if needed
            const newSelected = documents.filter((d) => next[d.id]);
            if (previewIndex >= newSelected.length) {
                setPreviewIndex(Math.max(0, newSelected.length - 1));
            }
            return next;
        });
        if (!quantities[docId]) {
            setQuantities((prev) => ({ ...prev, [docId]: 1 }));
        }
    };

    const handleQuantityChange = (docId, value) => {
        const qty = Math.min(10, Math.max(1, parseInt(value) || 1));
        setQuantities((prev) => ({ ...prev, [docId]: qty }));
    };

    const handleConfirm = () => {
        if (confirming) return;
        if (selectedDocs.length === 0) {
            showAlert('No documents selected', 'Please select at least one document type.');
            return;
        }
        setConfirming(true);

        const requestedDocs = selectedDocs.map((doc) => ({
            name: doc.label,
            quantity: quantities[doc.id] || 1,
            requiresPurpose: doc.requiresPurpose === true,
        }));

        localStorage.setItem('requestedDocuments', JSON.stringify(requestedDocs));
        router.push('/payment');
    };

    const handlePreviewClick = () => {
        if (selectedDocs.length === 0) return;
        const current = selectedDocs[previewIndex];
        if (current) {
            setModalImage(current);
        }
    };

    return (
        <>
            {dialogs}
            {/* Time Display */}
            <TimeDisplay />

            {/* Greeting */}
            <div className={styles.greetingSection}>
                <h2 className={styles.greeting}>
                    <strong>Hello {user?.name || 'Guest'}!</strong>
                </h2>
            </div>

            {/* Request Form */}
            <section className={styles.contentSection}>
                {/* Left Panel */}
                <div className={styles.leftPanel}>
                    <h2 className={styles.sectionTitle}>
                        Select the document you&apos;d like to request <span className={styles.requiredMark}>*</span>
                    </h2>
                    <p className={styles.sectionSubtitle}>Choose at least one document below:</p>

                    <div className={styles.documentOptions}>
                        {loading ? (
                            <p style={{ padding: '1rem', color: '#888' }}>Loading documents...</p>
                        ) : documents.length === 0 ? (
                            <p style={{ padding: '1rem', color: '#888' }}>No documents available.</p>
                        ) : (
                            documents.map((doc) => (
                            <label
                                key={doc.id}
                                className={styles.documentItem}
                                onClick={(e) => {
                                    // Prevent double-toggle from label+checkbox
                                    if (e.target.type !== 'checkbox') {
                                        e.preventDefault();
                                        handleToggle(doc.id);
                                    }
                                }}
                            >
                                <span className={styles.docCheckboxLabel}>
                                    <input
                                        type="checkbox"
                                        className={styles.realCheckbox}
                                        checked={!!selected[doc.id]}
                                        onChange={() => handleToggle(doc.id)}
                                        aria-label={doc.label}
                                    />
                                    <span className={styles.documentLabel}>{doc.label}</span>
                                </span>
                                <input
                                    type="number"
                                    className={styles.docQuantity}
                                    min="1"
                                    max="10"
                                    value={quantities[doc.id] || 1}
                                    onChange={(e) => handleQuantityChange(doc.id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={!selected[doc.id]}
                                    aria-label="Quantity"
                                />
                            </label>
                            ))
                        )}
                    </div>

                    <button
                        className={styles.confirmBtn}
                        onClick={handleConfirm}
                        disabled={confirming}
                        aria-label="Confirm your document request"
                    >
                        {confirming ? 'Please wait...' : 'Confirm'}
                    </button>
                </div>

                {/* Right Panel — Preview */}
                <div className={styles.rightPanel}>
                    <div
                        className={styles.previewContainer}
                        onClick={handlePreviewClick}
                        tabIndex={0}
                        role="region"
                        aria-label="Document Preview"
                    >
                        <div className={styles.previewContent}>
                            {selectedDocs.length === 0 ? (
                                <div className={styles.previewPlaceholder}>
                                    Select a document to preview
                                </div>
                            ) : (() => {
                                const currentDoc = selectedDocs[previewIndex];
                                if (!currentDoc) return null;
                                return (
                                    <div
                                        key={currentDoc.id}
                                        className={`${styles.documentPreview} ${styles.active}`}
                                    >
                                        {currentDoc.image ? (
                                            <div className={styles.previewImageWrap}>
                                                <img
                                                    src={currentDoc.image}
                                                    alt={currentDoc.label}
                                                    className={styles.documentImage}
                                                    style={{ width: '100%', height: 'auto' }}
                                                    loading="lazy"
                                                />
                                                <div className={styles.previewWatermark} aria-hidden="true">
                                                    Preview
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={styles.previewPlaceholder}>
                                                No preview available for<br />{currentDoc.label}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {selectedDocs.length > 0 && selectedRequirements.length > 0 && (
                        <div className={styles.requirementsPanel}>
                            <div className={styles.requirementsTitle}>Requirements for this certificate</div>
                            <ul className={styles.requirementsList}>
                                {selectedRequirements.map((req) => (
                                    <li key={req}>{req}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Pagination Dots */}
                    {selectedDocs.length > 0 && (
                        <div className={styles.pageIndicator}>
                            {selectedDocs.map((doc, index) => (
                                <button
                                    key={doc.id}
                                    className={`${styles.indicatorDot} ${index === previewIndex ? styles.activeDot : ''}`}
                                    onClick={() => setPreviewIndex(index)}
                                    aria-label={`Preview page ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Modal */}
            {modalImage && (
                <div
                    className={styles.modal}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setModalImage(null);
                    }}
                    role="dialog"
                    aria-modal="true"
                >
                    <div className={styles.modalContent}>
                        <button
                            className={styles.closeModal}
                            onClick={() => setModalImage(null)}
                            aria-label="Close document preview"
                        >
                            &times;
                        </button>
                        {modalImage.image ? (
                            <div className={styles.previewImageWrap}>
                                <img
                                    src={modalImage.image}
                                    alt={modalImage.label}
                                    style={{ width: '100%', height: 'auto', maxHeight: '80vh', objectFit: 'contain' }}
                                    loading="lazy"
                                />
                                <div className={styles.previewWatermark} aria-hidden="true">
                                    Preview
                                </div>
                            </div>
                        ) : (
                            <div className={styles.previewPlaceholder} style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                No preview available for {modalImage.label}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
