'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import TimeDisplay from '@/components/TimeDisplay';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import { useAuth } from '@/hooks/useAuth';
import { usePolling } from '@/hooks/usePolling';
import styles from './page.module.css';

const STATUS_STEPS = [
    { key: 'pending',      label: 'Pending',     icon: '1' },
    { key: 'approved',     label: 'Validation',  icon: '2' },
    { key: 'for_release',  label: 'For Release', icon: '3' },
    { key: 'completed',    label: 'Done',         icon: '✓' },
];

const STATUS_COLORS = {
    pending: '#ff9800',
    approved: '#2196f3',
    for_release: '#4caf50',
    completed: '#0147AE',
    rejected: '#f44336',
    expired: '#b45309',
};

const STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Validation',
    for_release: 'For Release',
    completed: 'Done',
    rejected: 'Declined',
    expired: 'Expired',
};

function formatPaymentMethod(method) {
    const v = String(method || '').toLowerCase();
    if (v === 'gcash') return 'Online (GCash)';
    if (v === 'bank') return 'Online (Bank Transfer)';
    if (v === 'online') return 'Online';
    return 'Cash';
}

function TrackRequestContent() {
    const { showAlert, dialogs } = useAppDialogs();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const [requestNo, setRequestNo] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // My requests history
    const [myRequests, setMyRequests] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [deletingRequestNo, setDeletingRequestNo] = useState('');
    const [removeTarget, setRemoveTarget] = useState(null);

    // Auto-fill from URL query param
    useEffect(() => {
        const rn = searchParams.get('requestNo');
        if (rn) {
            setRequestNo(rn);
            lookupRequest(rn);
        }
    }, [searchParams]);

    // Fetch user's request history when logged in
    const fetchMyRequests = useCallback(() => {
        if (!user) return;
        fetch('/api/requests/my', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => setMyRequests(data.requests || []))
            .catch(() => {})
            .finally(() => setLoadingHistory(false));
    }, [user]);

    useEffect(() => {
        if (!user) return;
        setLoadingHistory(true);
        fetchMyRequests();
    }, [user, fetchMyRequests]);

    // Poll for tracked request updates
    const trackedRequestNo = useRef(null);
    useEffect(() => {
        trackedRequestNo.current = result?.requestNo || null;
    }, [result]);

    const pollTrackedRequest = useCallback(() => {
        const rn = trackedRequestNo.current;
        if (!rn) return;
        fetch(`/api/requests/track?requestNo=${encodeURIComponent(rn)}`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data?.request) setResult(data.request); })
            .catch(() => {});
    }, []);

    usePolling(fetchMyRequests, 10000, !!user);
    usePolling(pollTrackedRequest, 10000, !!result);

    const lookupRequest = async (rn) => {
        const num = rn || requestNo;
        if (!num.trim()) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await fetch(`/api/requests/track?requestNo=${encodeURIComponent(num.trim())}`, {
                cache: 'no-store',
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Request not found');
            } else {
                setResult(data.request);
            }
        } catch {
            setError('Failed to look up request. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        lookupRequest();
    };

    // Determine step states for the timeline
    const getStepState = (stepKey) => {
        if (!result) return '';
        if (result.status === 'rejected' || result.status === 'expired') return 'declined';

        const currentIdx = STATUS_STEPS.findIndex(s => s.key === result.status);
        const stepIdx = STATUS_STEPS.findIndex(s => s.key === stepKey);

        if (stepIdx < currentIdx) return 'completed';
        if (stepIdx === currentIdx) return 'active';
        return '';
    };

    // Calculate progress line width
    const getProgressWidth = () => {
        if (!result || result.status === 'rejected' || result.status === 'expired') return '0%';
        const currentIdx = STATUS_STEPS.findIndex(s => s.key === result.status);
        if (currentIdx <= 0) return '0%';
        const pct = (currentIdx / (STATUS_STEPS.length - 1)) * 100;
        return `${pct}%`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
        });
    };

    const handleTrackClick = (rn) => {
        setRequestNo(rn);
        lookupRequest(rn);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const openRemoveExpiredDialog = (req) => {
        if (!req?.requestNo || req.status !== 'expired') return;
        setRemoveTarget({ requestNo: req.requestNo });
    };

    const performRemoveExpired = async () => {
        if (!removeTarget?.requestNo) return;
        const rn = removeTarget.requestNo;
        setRemoveTarget(null);
        setDeletingRequestNo(rn);
        try {
            const res = await fetch('/api/requests/my', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestNo: rn }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showAlert('Remove failed', data.error || 'Remove failed.');
                return;
            }
            setMyRequests((prev) => prev.filter((r) => r.requestNo !== rn));
            if (result?.requestNo === rn) {
                setResult(null);
            }
        } catch {
            showAlert('Remove failed', 'Remove failed. Please try again.');
        } finally {
            setDeletingRequestNo('');
        }
    };

    return (
        <>
            {dialogs}
            <ConfirmDialog
                open={!!removeTarget}
                title="Remove request?"
                message={
                    removeTarget
                        ? `Remove expired request #${removeTarget.requestNo} from your list?`
                        : ''
                }
                confirmLabel="Remove"
                cancelLabel="Cancel"
                onConfirm={performRemoveExpired}
                onCancel={() => setRemoveTarget(null)}
            />
            <TimeDisplay />

            <div className={styles.welcomeSection}>
                <h1 className={styles.welcomeTitle}>
                    {user ? `Hello ${user.name}!` : 'Track Your Request'}
                </h1>
            </div>

            {/* Search Card */}
            <div className={styles.searchCard}>
                <h2 className={styles.searchTitle}>Request Tracker</h2>
                <p className={styles.searchSubtitle}>Enter your request number to check the status of your document request</p>

                <form className={styles.searchForm} onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Enter request number..."
                        value={requestNo}
                        onChange={(e) => setRequestNo(e.target.value)}
                    />
                    <button
                        type="submit"
                        className={styles.searchBtn}
                        disabled={loading || !requestNo.trim()}
                    >
                        {loading ? 'Searching...' : 'Track'}
                    </button>
                </form>

                {error && <div className={styles.errorBox}>{error}</div>}
            </div>

            {/* Result Card */}
            {result && (
                <div className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                        <h3 className={styles.resultTitle}>
                            {result.status === 'rejected'
                                ? 'Request Declined'
                                : result.status === 'expired'
                                    ? 'Request Expired'
                                    : 'Request Status'}
                        </h3>
                        <span className={styles.resultRequestNo}>#{result.requestNo}</span>
                    </div>

                    {/* Status Timeline */}
                    {result.status !== 'rejected' && result.status !== 'expired' ? (
                        <div className={styles.timeline}>
                            <div
                                className={styles.timelineProgress}
                                style={{ width: getProgressWidth() }}
                            />
                            {STATUS_STEPS.map((step) => {
                                const state = getStepState(step.key);
                                const cls = state === 'completed'
                                    ? styles.stepCompleted
                                    : state === 'active'
                                        ? styles.stepActive
                                        : '';
                                return (
                                    <div key={step.key} className={`${styles.timelineStep} ${cls}`}>
                                        <div className={styles.stepCircle}>
                                            {state === 'completed' ? '✓' : step.icon}
                                        </div>
                                        <span className={styles.stepLabel}>{step.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={styles.timeline}>
                            <div className={`${styles.timelineStep} ${styles.stepDeclined}`}>
                                <div className={styles.stepCircle}>✕</div>
                                <span className={styles.stepLabel}>
                                    {result.status === 'expired' ? 'Expired' : 'Declined'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Admin Notification */}
                    {result.adminNotes && (
                        <div className={styles.adminNotesBox}>
                            <span className={styles.adminNotesIcon}>⚠</span>
                            <div>
                                <strong>Notice from Admin:</strong>
                                <p style={{ margin: '4px 0 0' }}>{result.adminNotes}</p>
                            </div>
                        </div>
                    )}

                    {/* Rejection Reason */}
                    {result.rejectionReason && (
                        <div className={styles.rejectionBox}>
                            <strong>Reason:</strong> {result.rejectionReason}
                        </div>
                    )}

                    {/* Details */}
                    <div className={styles.detailsSection}>
                        <h4 className={styles.detailsTitle}>Request Details</h4>

                        <div className={styles.detailsGrid}>
                            <div className={styles.detailField}>
                                <span className={styles.detailLabel}>Name</span>
                                <span className={styles.detailValue}>{result.residentName}</span>
                            </div>
                            <div className={styles.detailField}>
                                <span className={styles.detailLabel}>Date Filed</span>
                                <span className={styles.detailValue}>{formatDate(result.date)}</span>
                            </div>
                            {result.status === 'expired' && (
                                <div className={styles.detailField}>
                                    <span className={styles.detailLabel}>Expired On</span>
                                    <span className={styles.detailValue}>{formatDate(result.expiredAt)}</span>
                                </div>
                            )}
                            <div className={styles.detailField}>
                                <span className={styles.detailLabel}>Payment</span>
                                <span className={styles.detailValue}>
                                    {formatPaymentMethod(result.paymentMethod)}
                                </span>
                            </div>
                            <div className={styles.detailField}>
                                <span className={styles.detailLabel}>Status</span>
                                <span
                                    className={styles.statusBadge}
                                    style={{ background: STATUS_COLORS[result.status] || '#999' }}
                                >
                                    {STATUS_LABELS[result.status] || result.status}
                                </span>
                            </div>
                            {result.orNumber?.trim() ? (
                                <div className={styles.detailField}>
                                    <span className={styles.detailLabel}>Official Receipt (OR) No.</span>
                                    <span className={styles.detailValue}>{result.orNumber}</span>
                                </div>
                            ) : null}
                            {result.purpose?.trim() ? (
                                <div className={styles.detailField} style={{ gridColumn: '1 / -1' }}>
                                    <span className={styles.detailLabel}>Purpose</span>
                                    <span className={styles.detailValue}>{result.purpose}</span>
                                </div>
                            ) : null}
                        </div>

                        {/* Documents */}
                        <h4 className={styles.detailsTitle}>Documents Requested</h4>
                        <div className={styles.docList}>
                            {(result.documents || []).map((doc, i) => (
                                <div key={i} className={styles.docItem}>
                                    <span>
                                        <span className={styles.docName}>{doc.name}</span>
                                        <span className={styles.docQty}>x{doc.quantity}</span>
                                    </span>
                                    <span className={styles.docPrice}>₱ {(doc.total || 0).toFixed(2)}</span>
                                </div>
                            ))}
                            <div className={styles.docTotal}>
                                <span>Total</span>
                                <span>₱ {(result.totalAmount || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* My Requests History */}
            {user && (
                <div className={styles.historyCard}>
                    <h2 className={styles.historyTitle}>My Requests</h2>
                    <p className={styles.historySubtitle}>Your document requests sorted by date</p>

                    {loadingHistory ? (
                        <p className={styles.historyLoading}>Loading your requests...</p>
                    ) : myRequests.length === 0 ? (
                        <p className={styles.historyEmpty}>You have no document requests yet.</p>
                    ) : (
                        <div className={styles.historyTableWrap}>
                            <table className={styles.historyTable}>
                                <thead>
                                    <tr>
                                        <th>Request No.</th>
                                        <th>Documents</th>
                                        <th>Status</th>
                                        <th>Date</th>
                                        <th>Expired On</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myRequests.map((req) => (
                                        <tr key={req.requestNo} className={req.adminNotes ? styles.hasNotification : ''}>
                                            <td className={styles.historyReqNo}>{req.requestNo}</td>
                                            <td>
                                                {(req.documents || []).map(d => d.name).join(', ') || '—'}
                                            </td>
                                            <td>
                                                <span
                                                    className={styles.statusBadge}
                                                    style={{ background: STATUS_COLORS[req.status] || '#999' }}
                                                >
                                                    {STATUS_LABELS[req.status] || req.status}
                                                </span>
                                                {req.adminNotes && (
                                                    <span className={styles.notifIndicator} title={req.adminNotes}>⚠</span>
                                                )}
                                            </td>
                                            <td>{formatDate(req.date)}</td>
                                            <td>{req.status === 'expired' ? formatDate(req.expiredAt) : '—'}</td>
                                            <td>
                                                <button
                                                    className={styles.viewBtn}
                                                    onClick={() => handleTrackClick(req.requestNo)}
                                                >
                                                    View
                                                </button>
                                                {req.status === 'expired' && (
                                                    <button
                                                        className={styles.deleteBtn}
                                                        onClick={() => openRemoveExpiredDialog(req)}
                                                        disabled={deletingRequestNo === req.requestNo}
                                                    >
                                                        {deletingRequestNo === req.requestNo ? 'Removing...' : 'Remove'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Nav Buttons */}
            <div className={styles.navButtons}>
                <Link href="/document-request" className={styles.requestBtn}>Request a Document</Link>
                <Link href="/" className={styles.homeBtn}>Return Home</Link>
            </div>
        </>
    );
}

export default function TrackRequestPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>}>
            <TrackRequestContent />
        </Suspense>
    );
}
