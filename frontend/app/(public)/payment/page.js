'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TimeDisplay from '@/components/TimeDisplay';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import { useAuth } from '@/hooks/useAuth';
import { usePolling } from '@/hooks/usePolling';
import { priceLineItems } from '@/lib/documentFeeResolve';
import { getRequirementsForDocuments } from '@/lib/documentRequirements';
import styles from './page.module.css';

export default function PaymentPage() {
    const router = useRouter();
    const { showAlert, dialogs } = useAppDialogs();
    const { user } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [documentFees, setDocumentFees] = useState([]);
    const [feesLoading, setFeesLoading] = useState(true);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [onlinePaymentType, setOnlinePaymentType] = useState('gcash');
    const [reference, setReference] = useState('');
    const [purpose, setPurpose] = useState('');
    const [purposeChoice, setPurposeChoice] = useState('');
    const [purposeOther, setPurposeOther] = useState('');
    const [commonPurposes, setCommonPurposes] = useState([]);
    const [documentRequirementsMap, setDocumentRequirementsMap] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [paymentConfig, setPaymentConfig] = useState({
        onlinePaymentEnabled: true,
        gcash: { accountName: 'Barangay Tibanga', accountNumber: '0900 000 0000', qrImageUrl: '' },
        bank: { bankName: 'LandBank', accountName: 'Barangay Tibanga', accountNumber: '0000-0000-0000' },
    });
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrError, setOcrError] = useState('');
    const [purposeDialogOpen, setPurposeDialogOpen] = useState(false);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

    useEffect(() => {
        const stored = JSON.parse(localStorage.getItem('requestedDocuments') || '[]');
        setDocuments(stored);
    }, []);

    useEffect(() => {
        fetch('/api/request-config')
            .then((r) => (r.ok ? r.json() : {}))
            .then((d) => {
                if (Array.isArray(d.commonPurposes)) setCommonPurposes(d.commonPurposes);
                if (d.documentRequirements) setDocumentRequirementsMap(d.documentRequirements);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (purposeChoice === 'other') {
            setPurpose(purposeOther.trim());
        } else if (purposeChoice) {
            setPurpose(purposeChoice);
        } else {
            setPurpose('');
        }
    }, [purposeChoice, purposeOther]);

    const fetchFees = useCallback(async () => {
        try {
            const [feeRes, configRes] = await Promise.all([
                fetch('/api/document-fees'),
                fetch('/api/payment-config'),
            ]);
            const feeData = await feeRes.json();
            if (feeData.documentFees) setDocumentFees(feeData.documentFees);

            const cfgData = await configRes.json().catch(() => ({}));
            if (cfgData.paymentConfig) setPaymentConfig(cfgData.paymentConfig);
        } catch {
            /* keep previous fees */
        } finally {
            setFeesLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFees();
    }, [fetchFees]);

    useEffect(() => {
        router.prefetch('/payment-summary');
    }, [router]);

    // Fees/config rarely change; keep polling infrequent to reduce network churn on hosted DB.
    usePolling(fetchFees, 60000);

    const onlinePaymentEnabled = paymentConfig.onlinePaymentEnabled !== false;

    useEffect(() => {
        if (!onlinePaymentEnabled) {
            if (paymentMethod === 'online') {
                setPaymentMethod('cash');
                setReference('');
                setOnlinePaymentType('gcash');
                setOcrError('');
            } else if (!paymentMethod) {
                setPaymentMethod('cash');
            }
        }
    }, [onlinePaymentEnabled, paymentMethod]);

    const items = priceLineItems(documentFees, documents);
    const grandTotal = items.reduce((sum, item) => sum + item.total, 0);
    const submitRequirements = getRequirementsForDocuments(items.map((i) => i.name), documentRequirementsMap);

    const handleReceiptUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setOcrError('');
        setOcrLoading(true);
        try {
            const { recognize } = await import('tesseract.js');
            const result = await recognize(file, 'eng', { logger: () => {} });
            const text = (result?.data?.text || '').replace(/\s+/g, ' ');

            const patterns = [
                /ref(?:erence)?\s*(?:no|number|#|num)?\s*[:.\-]?\s*([A-Z0-9-]{6,})/i,
                /(?:trx|transaction)\s*(?:id|no|#)?\s*[:.\-]?\s*([A-Z0-9-]{6,})/i,
            ];
            let extracted = '';
            for (const p of patterns) {
                const m = text.match(p);
                if (m?.[1]) {
                    extracted = m[1];
                    break;
                }
            }
            if (!extracted) {
                const digitCandidates = text.match(/\b\d{10,}\b/g) || [];
                if (digitCandidates.length > 0) {
                    extracted = digitCandidates.sort((a, b) => b.length - a.length)[0];
                }
            }

            if (extracted) {
                setReference(extracted.trim());
            } else {
                setOcrError('Could not detect a reference number. Try a clearer screenshot or type it manually.');
            }
        } catch {
            setOcrError('Could not read the image. Please try again or type the reference number manually.');
        } finally {
            setOcrLoading(false);
        }
    };

    const copyText = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            showAlert('Copied', 'Copied to clipboard.');
        } catch {
            showAlert('Copy failed', 'Please copy manually.');
        }
    };

    const maskAccountNumber = (value, type = 'generic') => {
        const text = String(value || '');
        const digits = text.replace(/\D/g, '');
        if (digits.length <= 4) return text || 'N/A';
        if (type === 'gcash' && digits.length >= 11) {
            return `${digits.slice(0, 2)}** *** ${digits.slice(-4)}`;
        }
        const last4 = digits.slice(-4);
        return `**** **** ${last4}`;
    };

    const confirmCancelRequest = () => {
        setCancelDialogOpen(false);
        try {
            localStorage.removeItem('requestedDocuments');
            localStorage.removeItem('paymentInfo');
        } catch {
            /* ignore */
        }
        setDocuments([]);
        setReference('');
        setPurpose('');
        setPurposeChoice('');
        setPurposeOther('');
        setPaymentMethod('');
        setOnlinePaymentType('gcash');
        router.push('/document-request');
    };

    const openGcashApp = () => {
        window.location.href = 'gcash://';
        setTimeout(() => {
            window.open('https://www.gcash.com/', '_blank', 'noopener,noreferrer');
        }, 900);
    };

    const handleSubmit = async () => {
        if (!paymentMethod) {
            showAlert('Payment method required', 'Please select a payment method.');
            return;
        }
        if (paymentMethod === 'online' && !onlinePaymentEnabled) {
            showAlert('Online payment unavailable', 'Online payment is not available. Please use cash.');
            return;
        }
        if (paymentMethod === 'online' && !reference.trim()) {
            showAlert('Reference required', 'Please enter a reference number for online payment.');
            return;
        }

        if (items.length === 0) {
            showAlert('No documents', 'No documents in your request. Go back and select documents first.');
            return;
        }

        const purposeText = purpose.trim().replace(/\s+/g, ' ');
        if (purposeText.length < 3) {
            setPurposeDialogOpen(true);
            return;
        }
        if (purposeText.length > 250) {
            showAlert('Purpose too long', 'Purpose must be 250 characters or less.');
            return;
        }

        const resolvedPaymentMethod = paymentMethod === 'online'
            ? (onlinePaymentType === 'bank' ? 'bank' : 'gcash')
            : 'cash';

        const now = new Date();
        const requestNo = [
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getFullYear()).slice(-2),
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0'),
        ].join('');

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    residentName: user?.name || 'Guest',
                    documents: items,
                    paymentMethod: resolvedPaymentMethod,
                    referenceNo: reference.trim(),
                    purpose: purposeText,
                    requestNo,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showAlert('Request failed', data.error || 'Could not save your request. Please try again.');
                setSubmitting(false);
                return;
            }

            localStorage.setItem('paymentInfo', JSON.stringify({
                paymentMethod: resolvedPaymentMethod,
                referenceNo: reference.trim(),
                requestNo,
            }));

            router.push('/payment-summary');
        } catch {
            showAlert('Request failed', 'Could not save your request. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {dialogs}
            <ConfirmDialog
                open={purposeDialogOpen}
                title="Purpose required"
                message="Please enter the purpose of your request before placing it (e.g. employment, scholarship, loan application)."
                confirmLabel="OK"
                cancelLabel={null}
                confirmVariant="neutral"
                onConfirm={() => setPurposeDialogOpen(false)}
                onCancel={() => setPurposeDialogOpen(false)}
            />
            <ConfirmDialog
                open={cancelDialogOpen}
                title="Cancel request?"
                message="Your selected documents will be cleared and you'll return to document selection."
                confirmLabel="Yes, cancel"
                cancelLabel="Keep request"
                confirmVariant="primary"
                onConfirm={confirmCancelRequest}
                onCancel={() => setCancelDialogOpen(false)}
            />
            <TimeDisplay />

            <div className={styles.greetingSection}>
                <h2 className={styles.greeting}>
                    <strong>Hello {user?.name || 'Guest'}!</strong>
                </h2>
            </div>

            <div className={styles.requestCard}>
                <h2 className={styles.cardTitle}>Request Summary</h2>
                <p className={styles.cardSubtitle}>
                    Kindly confirm your request and mode of payment
                </p>
                {feesLoading && (
                    <p style={{ color: '#888', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                        Loading current fees…
                    </p>
                )}

                <div className={styles.itemSummary}>
                    {items.length === 0 ? (
                        <div className={styles.itemRow}>
                            <span className={styles.itemName}>No documents selected</span>
                            <span className={styles.itemPrice}>₱ 0.00</span>
                        </div>
                    ) : (
                        items.map((item, i) => (
                            <div className={styles.itemRow} key={i}>
                                <span className={styles.itemName}>{item.name} x{item.qty}</span>
                                <span className={styles.itemPrice}>₱ {item.total.toFixed(2)}</span>
                            </div>
                        ))
                    )}
                    <div className={`${styles.itemRow} ${styles.totalRow}`}>
                        <span className={styles.itemName}><strong>Item Total:</strong></span>
                        <span className={styles.itemPrice}><strong>₱ {grandTotal.toFixed(2)}</strong></span>
                    </div>
                </div>

                {items.length > 0 && (
                    <>
                        {submitRequirements.length > 0 && (
                            <div className={styles.requirementsPanel}>
                                <div className={styles.requirementsTitle}>Required documents / items</div>
                                <ul className={styles.requirementsList}>
                                    {submitRequirements.map((req) => (
                                        <li key={req}>{req}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className={styles.sectionTitle}>
                            Purpose of Request <span className={styles.requiredMark}>*</span>
                        </div>
                        <select
                            className={styles.purposeSelect}
                            value={purposeChoice}
                            onChange={(e) => setPurposeChoice(e.target.value)}
                            aria-required="true"
                        >
                            <option value="">Select purpose…</option>
                            {commonPurposes.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                            <option value="other">Other…</option>
                        </select>
                        {purposeChoice === 'other' && (
                            <textarea
                                className={styles.purposeInput}
                                placeholder="Please specify your purpose"
                                value={purposeOther}
                                onChange={(e) => setPurposeOther(e.target.value)}
                                rows={3}
                                maxLength={250}
                                aria-required="true"
                            />
                        )}
                        <p className={styles.purposeHint}>
                            Required for every request. Some certificates do not print this on the document, but the
                            barangay still keeps it on record.
                        </p>
                    </>
                )}

                <div className={styles.sectionTitle}>
                    Payment Method <span className={styles.requiredMark}>*</span>
                </div>
                {!onlinePaymentEnabled && (
                    <p className={styles.cashOnlyHint}>
                        This barangay currently accepts cash payment only at the office.
                    </p>
                )}
                <div className={styles.paymentOptions}>
                    <label
                        className={`${styles.paymentOption} ${paymentMethod === 'cash' ? styles.selected : ''}`}
                        onClick={() => setPaymentMethod('cash')}
                    >
                        <input
                            type="radio"
                            name="payment"
                            value="cash"
                            checked={paymentMethod === 'cash'}
                            onChange={() => setPaymentMethod('cash')}
                        />
                        <span>Cash</span>
                    </label>
                    {onlinePaymentEnabled && (
                        <label
                            className={`${styles.paymentOption} ${paymentMethod === 'online' ? styles.selected : ''}`}
                            onClick={() => setPaymentMethod('online')}
                        >
                            <input
                                type="radio"
                                name="payment"
                                value="online"
                                checked={paymentMethod === 'online'}
                                onChange={() => setPaymentMethod('online')}
                            />
                            <span>Online Payment</span>
                        </label>
                    )}
                </div>
                {onlinePaymentEnabled && paymentMethod === 'online' && (
                    <>
                        <div className={styles.onlineTypeRow}>
                            <label className={`${styles.paymentOption} ${onlinePaymentType === 'gcash' ? styles.selected : ''}`}>
                                <input
                                    type="radio"
                                    name="onlinePaymentType"
                                    value="gcash"
                                    checked={onlinePaymentType === 'gcash'}
                                    onChange={() => setOnlinePaymentType('gcash')}
                                />
                                <span>GCash</span>
                            </label>
                            <label className={`${styles.paymentOption} ${onlinePaymentType === 'bank' ? styles.selected : ''}`}>
                                <input
                                    type="radio"
                                    name="onlinePaymentType"
                                    value="bank"
                                    checked={onlinePaymentType === 'bank'}
                                    onChange={() => setOnlinePaymentType('bank')}
                                />
                                <span>Bank Transfer</span>
                            </label>
                        </div>

                        <div className={styles.accountsWrap}>
                            {onlinePaymentType === 'gcash' ? (
                                <div className={styles.accountCard}>
                                    <div className={styles.accountHeader}>
                                        <img src="/images/gcash.svg" alt="GCash" className={styles.accountIcon} />
                                        <div className={styles.accountTitle}>GCash</div>
                                    </div>
                                    <div className={styles.accountLine}>Name: {paymentConfig.gcash?.accountName || 'N/A'}</div>
                                    <div className={styles.accountLine}>
                                        Number: {maskAccountNumber(paymentConfig.gcash?.accountNumber, 'gcash')}
                                        <button
                                            type="button"
                                            className={styles.copyBtn}
                                            onClick={() => copyText(paymentConfig.gcash?.accountNumber || '')}
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.openGcashBtn}
                                        onClick={openGcashApp}
                                    >
                                        Open GCash App
                                    </button>
                                    {paymentConfig.gcash?.qrImageUrl ? (
                                        <div className={styles.gcashQrWrap}>
                                            <img
                                                src={paymentConfig.gcash.qrImageUrl}
                                                alt="GCash QR code"
                                                className={styles.gcashQrImage}
                                                loading="lazy"
                                            />
                                            <p className={styles.gcashQrHint}>Scan this QR in your GCash app.</p>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className={styles.accountCard}>
                                    <div className={styles.accountHeader}>
                                        <img src="/images/landbank.svg" alt="Bank" className={styles.accountIcon} />
                                        <div className={styles.accountTitle}>Bank</div>
                                    </div>
                                    <div className={styles.accountLine}>{paymentConfig.bank?.bankName || 'N/A'}</div>
                                    <div className={styles.accountLine}>Name: {paymentConfig.bank?.accountName || 'N/A'}</div>
                                    <div className={styles.accountLine}>
                                        Account: {maskAccountNumber(paymentConfig.bank?.accountNumber, 'bank')}
                                        <button
                                            type="button"
                                            className={styles.copyBtn}
                                            onClick={() => copyText(paymentConfig.bank?.accountNumber || '')}
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.referenceRow}>
                            <input
                                type="text"
                                className={styles.referenceInput}
                                placeholder="Type in the reference number here"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                            <label className={styles.uploadBtn}>
                                {ocrLoading ? 'Reading...' : 'Upload Receipt'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className={styles.uploadInput}
                                    disabled={ocrLoading}
                                    onChange={handleReceiptUpload}
                                />
                            </label>
                        </div>
                        {ocrError && <p className={styles.ocrError}>{ocrError}</p>}
                        <p className={styles.ocrHint}>Tip: Upload a clear screenshot where &quot;Ref No.&quot; is visible.</p>
                    </>
                )}

                <div className={styles.buttonGroup}>
                    <button
                        type="button"
                        className={`${styles.btn} ${styles.btnCancel}`}
                        onClick={() => setCancelDialogOpen(true)}
                        disabled={submitting}
                    >
                        Cancel Request
                    </button>
                    <button
                        className={`${styles.btn} ${styles.btnSubmit}`}
                        onClick={handleSubmit}
                        disabled={submitting || items.length === 0 || !paymentMethod}
                    >
                        {submitting ? 'Saving…' : 'Place Request'}
                    </button>
                </div>
            </div>
        </>
    );
}
