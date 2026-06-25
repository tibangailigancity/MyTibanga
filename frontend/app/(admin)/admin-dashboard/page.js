'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Portal from '@/app/components/Portal';
import { usePolling } from '@/hooks/usePolling';
import { useAuth } from '@/hooks/useAuth';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import { buildRequirementChecklist } from '@/lib/documentRequirements';
import styles from './page.module.css';

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending', color: '#ff9800' },
    { value: 'approved', label: 'Validation', color: '#2196f3' },
    { value: 'for_release', label: 'For Release', color: '#4caf50' },
    { value: 'completed', label: 'Done', color: '#0147AE' },
];

const DOCUMENT_FILTER_OPTIONS = [
    'Barangay Certificate',
    'Barangay Certificate for Motorized Banca',
    'Barangay Certificate for Solo Parents',
    'Barangay Certificate of Indigency',
    'Barangay Certificate of Residency',
];

function normalizeDocumentName(name = '') {
    const raw = String(name).trim();
    const lowered = raw.toLowerCase();
    if (!raw) return '';

    if (/motorized\s*banca/.test(lowered)) return 'Barangay Certificate for Motorized Banca';
    if (/solo\s*parents?/.test(lowered)) return 'Barangay Certificate for Solo Parents';
    if (/indigency/.test(lowered)) return 'Barangay Certificate of Indigency';
    if (/residency/.test(lowered)) return 'Barangay Certificate of Residency';
    if (/barangay\s*certificate/.test(lowered) || /barangay\s*clearance/.test(lowered)) {
        return 'Barangay Certificate';
    }

    return raw;
}

function formatPaymentMethod(method) {
    const value = String(method || '').toLowerCase();
    if (value === 'gcash') return 'Online (GCash)';
    if (value === 'bank') return 'Online (Bank Transfer)';
    if (value === 'online') return 'Online';
    return 'Cash';
}

export default function AdminDashboardPage() {
    useAuth();
    const router = useRouter();
    const { showAlert, dialogs } = useAppDialogs();
    const normalizePurpose = (value = '') => String(value).trim().replace(/\s+/g, ' ');
    const requestManagementRef = useRef(null);

    const [requests, setRequests] = useState([]);
    const [residents, setResidents] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [documentFilter, setDocumentFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [checkedRequirements, setCheckedRequirements] = useState({});
    const [documentFiles, setDocumentFiles] = useState([]);

    // Notify dialog state
    const [showNotifyDialog, setShowNotifyDialog] = useState(false);
    const [notifyTargetId, setNotifyTargetId] = useState(null);
    const [notifyMissingReqs, setNotifyMissingReqs] = useState({});
    const [notifyNotes, setNotifyNotes] = useState('');
    const [orBooklet, setOrBooklet] = useState(null);
    const [orOverrideOpen, setOrOverrideOpen] = useState(false);
    const [orOverrideDraft, setOrOverrideDraft] = useState('');
    const [purposeDraft, setPurposeDraft] = useState('');
    const [purposeEditing, setPurposeEditing] = useState(false);
    const [savingPurpose, setSavingPurpose] = useState(false);
    const [showExpiredModal, setShowExpiredModal] = useState(false);
    const [documentRequirementsMap, setDocumentRequirementsMap] = useState({});
    const [notifyReqList, setNotifyReqList] = useState([]);

    useEffect(() => {
        fetch('/api/request-config')
            .then((r) => (r.ok ? r.json() : {}))
            .then((d) => {
                if (d.documentRequirements) setDocumentRequirementsMap(d.documentRequirements);
            })
            .catch(() => {});
    }, []);

    const getRequirementsForRequest = (req) => {
        if (!req) return [];
        const names = (req.documents || []).map((d) => d.name).filter(Boolean);
        if (names.length === 0 && req.document) names.push(req.document);
        return buildRequirementChecklist(names, documentRequirementsMap);
    };

    useEffect(() => {
        if (selectedRequest) {
            setOrOverrideDraft(selectedRequest.orNumber || '');
            setOrOverrideOpen(false);
            setPurposeDraft(selectedRequest.purpose || '');
            setPurposeEditing(
                selectedRequest.status === 'pending' && !selectedRequest.purpose?.trim()
            );
        } else {
            setOrOverrideDraft('');
            setOrOverrideOpen(false);
            setPurposeDraft('');
            setPurposeEditing(false);
        }
    }, [selectedRequest?.id]);

    const fetchData = () => {
        fetch('/api/admin/requests')
            .then((res) => res.json())
            .then((data) => {
                setRequests(data.requests || []);
                if (data.orBooklet) setOrBooklet(data.orBooklet);
            })
            .catch(() => setRequests([]));

        fetch('/api/admin/stats')
            .then((res) => (res.ok ? res.json() : { residents: [] }))
            .then((data) => setResidents(data.residents || []))
            .catch(() => setResidents([]));

        fetch('/api/admin/documents')
            .then((res) => res.json())
            .then((data) => setDocumentFiles(data.documents || []))
            .catch(() => setDocumentFiles([]));
    };

    useEffect(() => {
        fetchData();
    }, []);

    usePolling(fetchData, 10000);

    // ── Filtering ──
    const visibleRequests = requests.filter(
        (r) => r.status !== 'rejected' && r.status !== 'declined' && r.status !== 'expired'
    );
    const expiredRequests = requests
        .filter((r) => r.status === 'expired')
        .sort((a, b) => new Date(b.expiredAt || b.date) - new Date(a.expiredAt || a.date));
    const documentOptions = DOCUMENT_FILTER_OPTIONS;

    const filtered = visibleRequests
        .filter((r) => statusFilter === 'all' || r.status === statusFilter)
        .filter((r) => {
            if (documentFilter === 'all') return true;
            return (r.documents || []).some((d) => normalizeDocumentName(d.name) === documentFilter);
        })
        .filter((r) => {
            if (!search) return true;
            const term = search.toLowerCase();
            const docsMatch = r.documents?.some((d) => d.name.toLowerCase().includes(term));
            return (
                r.residentName?.toLowerCase().includes(term) ||
                r.requestNo?.includes(search) ||
                docsMatch
            );
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    // ── Pagination ──
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const safePage = Math.min(currentPage, totalPages);
    const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

    // ── Counts ──
    const pendingRequests = visibleRequests.filter((r) => r.status === 'pending');
    const validationRequests = visibleRequests.filter((r) => r.status === 'approved');
    const totalResidents = residents.length;

    const scrollToRequestManagement = () => {
        requestAnimationFrame(() => {
            requestManagementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const applyStatusFilter = (status) => {
        setStatusFilter(status);
        setCurrentPage(1);
        scrollToRequestManagement();
    };

    const counts = {
        all: visibleRequests.length,
        pending: visibleRequests.filter((r) => r.status === 'pending').length,
        approved: visibleRequests.filter((r) => r.status === 'approved').length,
        for_release: visibleRequests.filter((r) => r.status === 'for_release').length,
        completed: visibleRequests.filter((r) => r.status === 'completed').length,
    };

    // ── Helpers ──
    const getStatusInfo = (status) => {
        return STATUS_OPTIONS.find((s) => s.value === status) || { label: status, color: '#999' };
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
        });
    };

    const getDocSummary = (req) => {
        if (!req.documents || req.documents.length === 0) {
            return req.document || '—';
        }
        if (req.documents.length === 1) {
            const d = req.documents[0];
            return `${d.name} x${d.quantity}`;
        }
        return `${req.documents.length} documents`;
    };

    // ── Open Notify Dialog ──
    const openNotifyDialog = (id) => {
        const req = requests.find((r) => r.id === id);
        setNotifyReqList(getRequirementsForRequest(req));
        setNotifyTargetId(id);
        setNotifyMissingReqs({});
        setNotifyNotes('');
        setShowNotifyDialog(true);
    };

    // ── Submit Notification (keeps status pending) ──
    const handleNotifySubmit = async () => {
        const missing = notifyReqList.filter((r) => notifyMissingReqs[r.key]).map((r) => r.label);
        let notes = '';
        if (missing.length > 0) {
            notes = 'Missing requirements: ' + missing.join(', ') + '.';
        }
        if (notifyNotes.trim()) {
            notes += (notes ? ' ' : '') + notifyNotes.trim();
        }
        if (!notes) {
            notes = 'Please check with the barangay office for your requirements.';
        }

        setShowNotifyDialog(false);
        setSelectedRequest(null);

        // Save notes without changing status
        try {
            const res = await fetch('/api/admin/requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: notifyTargetId, adminNotes: notes }),
            });
            const data = await res.json();
            if (data.success) fetchData();
        } catch {
            showAlert('Notification failed', 'Failed to send notification');
        }
    };

    const saveOrOverride = async () => {
        if (!selectedRequest || !orOverrideDraft.trim()) return;
        try {
            const res = await fetch('/api/admin/requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedRequest.id, orNumber: orOverrideDraft.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                const next = data.request?.orNumber ?? orOverrideDraft.trim();
                setSelectedRequest({ ...selectedRequest, orNumber: next });
                setOrOverrideOpen(false);
                fetchData();
            } else {
                showAlert('Save failed', data.error || 'Failed to save OR number');
            }
        } catch {
            showAlert('Save failed', 'Failed to save OR number');
        }
    };

    const savePurpose = async () => {
        if (!selectedRequest || selectedRequest.status !== 'pending') return;
        const trimmed = normalizePurpose(purposeDraft);
        if (trimmed.length < 3) return;

        setSavingPurpose(true);
        try {
            const res = await fetch('/api/admin/requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedRequest.id, purpose: trimmed }),
            });
            const data = await res.json();
            if (data.success) {
                const next = data.request?.purpose ?? trimmed;
                setSelectedRequest((prev) => (prev ? { ...prev, purpose: next } : prev));
                setPurposeDraft(next);
                setPurposeEditing(false);
                setRequests((prev) =>
                    prev.map((r) => (r.id === selectedRequest.id ? { ...r, purpose: next } : r))
                );
            } else {
                showAlert('Save failed', data.error || 'Failed to save purpose');
            }
        } catch {
            showAlert('Save failed', 'Failed to save purpose');
        } finally {
            setSavingPurpose(false);
        }
    };

    const canEditPurpose = selectedRequest?.status === 'pending';
    const purposeUnchanged =
        normalizePurpose(purposeDraft) === normalizePurpose(selectedRequest?.purpose || '');
    // ── Status Change (API) ──
    const handleStatusChange = async (id, newStatus, opts = {}) => {
        const { rejectionReason, orNumber } = opts;
        setUpdatingId(id);
        try {
            const body = { id, status: newStatus };
            if (rejectionReason) body.rejectionReason = rejectionReason;
            if (orNumber !== undefined) body.orNumber = orNumber;

            const res = await fetch('/api/admin/requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                if (data.orBooklet) setOrBooklet(data.orBooklet);
                fetchData();
                if (selectedRequest?.id === id) {
                    setSelectedRequest({
                        ...selectedRequest,
                        status: newStatus,
                        orNumber: data.request?.orNumber ?? selectedRequest.orNumber,
                        purpose: data.request?.purpose ?? selectedRequest.purpose,
                    });
                }
            } else {
                showAlert('Update failed', data.error || 'Failed to update status');
            }
        } catch {
            showAlert('Update failed', 'Failed to update status');
        } finally {
            setUpdatingId(null);
        }
    };

    // ── Monthly Trend ──
    const getMonthlyTrend = () => {
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleString('default', { month: 'short' });
            const year = date.getFullYear();
            const monthRequests = visibleRequests.filter((r) => {
                const rd = new Date(r.date);
                return rd.getMonth() === date.getMonth() && rd.getFullYear() === date.getFullYear();
            });
            months.push({
                label: `${monthName} ${year}`,
                shortLabel: monthName,
                total: monthRequests.length,
                approved: monthRequests.filter((r) => r.status === 'approved' || r.status === 'completed').length,
            });
        }
        return months;
    };

    const monthlyTrend = getMonthlyTrend();
    const maxTrend = Math.max(...monthlyTrend.map((m) => m.total), 1);

    return (
        <>
            {dialogs}
        <div className={styles.dashboard}>
            {/* ── Stat Cards ── */}
            <div className={styles.statCards}>
                <button
                    type="button"
                    className={`${styles.statCard} ${styles.statCardClickable}`}
                    onClick={() => applyStatusFilter('all')}
                    aria-label="View all requests"
                >
                    <span className={styles.statNumber}>{visibleRequests.length}</span>
                    <span className={styles.statLabel}>Total Requests</span>
                    <span className={styles.statHint}>View all</span>
                </button>
                <button
                    type="button"
                    className={`${styles.statCard} ${styles.statCardClickable}`}
                    onClick={() => applyStatusFilter('pending')}
                    aria-label="View pending requests"
                >
                    <span className={`${styles.statNumber} ${styles.pendingNumber}`}>{String(pendingRequests.length).padStart(2, '0')}</span>
                    <span className={styles.statLabel}>Pending</span>
                    <span className={styles.statHint}>View pending</span>
                </button>
                <button
                    type="button"
                    className={`${styles.statCard} ${styles.statCardClickable}`}
                    onClick={() => applyStatusFilter('approved')}
                    aria-label="View requests in validation"
                >
                    <span className={`${styles.statNumber} ${styles.validationNumber}`}>{validationRequests.length}</span>
                    <span className={styles.statLabel}>Validation</span>
                    <span className={styles.statHint}>View validation</span>
                </button>
                <button
                    type="button"
                    className={`${styles.statCard} ${styles.statCardClickable}`}
                    onClick={() => router.push('/resident-records')}
                    aria-label="View resident records"
                >
                    <span className={`${styles.statNumber} ${styles.residentsNumber}`}>{totalResidents > 0 ? totalResidents : '—'}</span>
                    <span className={styles.statLabel}>Residents</span>
                    <span className={styles.statHint}>View records</span>
                </button>
            </div>

            {/* ── Request Management Section ── */}
            <div className={styles.section} ref={requestManagementRef}>
                <h3 className={styles.sectionTitle}>Request Management</h3>

                {/* Status Tabs */}
                <div className={styles.statusTabs}>
                    <button
                        className={`${styles.statusTab} ${statusFilter === 'all' ? styles.activeTab : ''}`}
                        onClick={() => setStatusFilter('all')}
                    >
                        All ({counts.all})
                    </button>
                    {STATUS_OPTIONS.map((s) => (
                        <button
                            key={s.value}
                            className={`${styles.statusTab} ${statusFilter === s.value ? styles.activeTab : ''}`}
                            onClick={() => setStatusFilter(s.value)}
                            style={statusFilter === s.value ? { borderColor: s.color, color: s.color } : {}}
                        >
                            {s.label} ({counts[s.value] || 0})
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className={styles.filterBar}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search by name, document, or request number..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className={styles.documentSelect}
                        value={documentFilter}
                        onChange={(e) => {
                            setDocumentFilter(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="all">All Documents</option>
                        {documentOptions.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Table */}
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Request</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className={styles.emptyRow}>No requests found.</td>
                                </tr>
                            ) : (
                                paginated.map((req) => {
                                    const statusInfo = getStatusInfo(req.status);
                                    return (
                                        <tr key={req.id}>
                                            <td className={styles.nameCell}>{req.residentName}</td>
                                            <td>{getDocSummary(req)}</td>
                                            <td className={styles.dateCell}>{formatDate(req.date)}</td>
                                            <td>
                                                <span
                                                    className={styles.statusBadge}
                                                    style={{ background: statusInfo.color }}
                                                >
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className={styles.actionCell}>
                                                <button
                                                    className={styles.viewBtn}
                                                    onClick={() => setSelectedRequest(req)}
                                                >
                                                    View
                                                </button>
                                                {req.status === 'pending' && (
                                                    <button
                                                        className={styles.notifyBtn}
                                                        onClick={() => openNotifyDialog(req.id)}
                                                        disabled={updatingId === req.id}
                                                    >
                                                        Notify
                                                    </button>
                                                )}
                                                {req.status === 'approved' && (
                                                    <button
                                                        className={styles.releaseBtn}
                                                        onClick={() => handleStatusChange(req.id, 'for_release')}
                                                        disabled={updatingId === req.id}
                                                    >
                                                        Release
                                                    </button>
                                                )}
                                                {req.status === 'for_release' && (
                                                    <button
                                                        className={styles.completeBtn}
                                                        onClick={() => handleStatusChange(req.id, 'completed')}
                                                        disabled={updatingId === req.id}
                                                    >
                                                        Complete
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className={styles.paginationBar}>
                    <div className={styles.perPageSelector}>
                        <span>Show</span>
                        <select
                            value={perPage}
                            onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                            className={styles.perPageSelect}
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                        <span>per page</span>
                    </div>
                    <div className={styles.pageControls}>
                        <button
                            className={styles.pageBtn}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                        >
                            ← Prev
                        </button>
                        <span className={styles.pageInfo}>Page {safePage} of {totalPages}</span>
                        <button
                            className={styles.pageBtn}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Monthly Request Trend ── */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Monthly Request Trend</h3>
                <div className={styles.chartContainer}>
                    <div className={styles.barChart}>
                        {monthlyTrend.map((month, i) => (
                            <div key={i} className={styles.barGroup}>
                                <div className={styles.barWrapper}>
                                    <div
                                        className={styles.bar}
                                        style={{ height: `${Math.max((month.total / maxTrend) * 100, 8)}%` }}
                                    >
                                        <span className={styles.barValue}>{month.total}</span>
                                    </div>
                                </div>
                                <span className={styles.barLabel}>{month.shortLabel}</span>
                            </div>
                        ))}
                    </div>
                    <div className={styles.chartLegend}>
                        <span className={styles.legendItem}>
                            <span className={`${styles.legendDot} ${styles.legendBlue}`}></span>
                            Total Requests
                        </span>
                    </div>
                </div>
            </div>

            {/* ── View Details Modal ── */}
            {selectedRequest && (
                <Portal onClose={() => setSelectedRequest(null)}>
                    <div className={styles.modalOverlay} onClick={() => setSelectedRequest(null)}>
                        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.modalBody}>
                                <button className={styles.modalClose} onClick={() => setSelectedRequest(null)}>×</button>
                                <h2 className={styles.modalTitle}>Request Details</h2>

                                {/* Basic Info */}
                                <div className={styles.modalGrid}>
                                    <div className={styles.modalField}>
                                        <span className={styles.modalLabel}>Request No.</span>
                                        <span className={styles.modalValue}>{selectedRequest.requestNo}</span>
                                    </div>
                                    <div className={styles.modalField}>
                                        <span className={styles.modalLabel}>Resident Name</span>
                                        <span className={styles.modalValue}>{selectedRequest.residentName}</span>
                                    </div>
                                    <div className={styles.modalField}>
                                        <span className={styles.modalLabel}>Date</span>
                                        <span className={styles.modalValue}>{formatDate(selectedRequest.date)}</span>
                                    </div>
                                    <div className={styles.modalField}>
                                        <span className={styles.modalLabel}>Payment Method</span>
                                        <span className={styles.modalValue}>{formatPaymentMethod(selectedRequest.paymentMethod)}</span>
                                    </div>
                                    {selectedRequest.referenceNo && (
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Reference No.</span>
                                            <span className={styles.modalValue}>{selectedRequest.referenceNo}</span>
                                        </div>
                                    )}
                                    <div className={styles.modalField}>
                                        <span className={styles.modalLabel}>Status</span>
                                        <span
                                            className={styles.statusBadge}
                                            style={{ background: getStatusInfo(selectedRequest.status).color }}
                                        >
                                            {getStatusInfo(selectedRequest.status).label}
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.modalOrStrip}>
                                    <span className={styles.modalLabel}>Official Receipt (OR) No.</span>
                                    {selectedRequest.orNumber?.trim() ? (
                                        <span className={styles.modalValue}>{selectedRequest.orNumber}</span>
                                    ) : selectedRequest.status === 'approved' ? (
                                        orBooklet ? (
                                            <span className={styles.modalValue}>{orBooklet.nextOr}</span>
                                        ) : (
                                            <span className={styles.modalOrHint}>
                                                Set the OR range in System Settings → Official Receipt (OR) first.
                                            </span>
                                        )
                                    ) : (
                                        <span className={styles.modalValue}>—</span>
                                    )}
                                    {selectedRequest.status === 'approved' && !selectedRequest.orNumber?.trim() && (
                                        <div className={styles.modalOrOverride}>
                                            {!orOverrideOpen ? (
                                                <button
                                                    type="button"
                                                    className={styles.orOverrideToggle}
                                                    onClick={() => setOrOverrideOpen(true)}
                                                >
                                                    Override OR
                                                </button>
                                            ) : (
                                                <div className={styles.modalOrInputRow}>
                                                    <input
                                                        type="text"
                                                        className={styles.modalOrInput}
                                                        placeholder="Manual OR number"
                                                        value={orOverrideDraft}
                                                        onChange={(e) => setOrOverrideDraft(e.target.value)}
                                                        autoComplete="off"
                                                    />
                                                    <button
                                                        type="button"
                                                        className={styles.saveOrBtn}
                                                        onClick={saveOrOverride}
                                                        disabled={!orOverrideDraft.trim()}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Documents Requested */}
                                <div className={styles.docListSection}>
                                    <h3 className={styles.docListTitle}>Documents Requested</h3>
                                    <div className={styles.docList}>
                                        {(selectedRequest.documents || []).map((doc, i) => (
                                            <div key={i} className={styles.docListItem}>
                                                <span className={styles.docListName}>{doc.name}</span>
                                                <span className={styles.docListQty}>x{doc.quantity}</span>
                                                <span className={styles.docListPrice}>₱ {(doc.total || 0).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        {!selectedRequest.documents && selectedRequest.document && (
                                            <div className={styles.docListItem}>
                                                <span className={styles.docListName}>{selectedRequest.document}</span>
                                                <span className={styles.docListQty}>x{selectedRequest.quantity || 1}</span>
                                                <span className={styles.docListPrice}>₱ {(selectedRequest.amount || 0).toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.docListTotal}>
                                        <span>Total:</span>
                                        <span>₱ {(selectedRequest.totalAmount || selectedRequest.amount || 0).toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className={styles.modalOrStrip}>
                                    <span className={styles.modalLabel}>Purpose</span>
                                    {canEditPurpose && purposeEditing ? (
                                        <div className={`${styles.modalOrInputRow} ${styles.modalPurposeEditRow}`}>
                                            <textarea
                                                className={`${styles.modalOrInput} ${styles.modalPurposeInput}`}
                                                placeholder="Purpose of request (e.g. employment, scholarship)"
                                                value={purposeDraft}
                                                onChange={(e) => setPurposeDraft(e.target.value)}
                                                rows={2}
                                                maxLength={250}
                                            />
                                            <button
                                                type="button"
                                                className={styles.saveOrBtn}
                                                onClick={savePurpose}
                                                disabled={
                                                    savingPurpose
                                                    || purposeDraft.trim().length < 3
                                                    || purposeUnchanged
                                                }
                                            >
                                                {savingPurpose ? 'Saving…' : 'Save'}
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={styles.modalOrInputRow}>
                                                <span className={styles.modalValue}>
                                                    {selectedRequest.purpose?.trim() ? selectedRequest.purpose : '—'}
                                                </span>
                                                {canEditPurpose && (
                                                    <button
                                                        type="button"
                                                        className={styles.saveOrBtn}
                                                        onClick={() => {
                                                            setPurposeDraft(selectedRequest.purpose || '');
                                                            setPurposeEditing(true);
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className={styles.requirementsSection}>
                                    <h3 className={styles.docListTitle}>Requirements</h3>
                                    {getRequirementsForRequest(selectedRequest).map((req) => (
                                        <label key={req.key} className={styles.requirementItem}>
                                            <input
                                                type="checkbox"
                                                checked={selectedRequest.status !== 'pending' || !!checkedRequirements[selectedRequest.id + '_' + req.key]}
                                                disabled={selectedRequest.status !== 'pending'}
                                                onChange={(e) => setCheckedRequirements(prev => ({
                                                    ...prev,
                                                    [selectedRequest.id + '_' + req.key]: e.target.checked
                                                }))}
                                                className={styles.requirementCheckbox}
                                            />
                                            <span>{req.label}</span>
                                        </label>
                                    ))}
                                </div>

                                {/* Rejection Reason */}
                                {selectedRequest.rejectionReason && (
                                    <div className={styles.rejectionBox}>
                                        <strong>Rejection Reason:</strong> {selectedRequest.rejectionReason}
                                    </div>
                                )}

                                {/* Status Action Buttons */}
                                <div className={styles.modalActions}>
                                    {selectedRequest.status === 'pending' && (
                                        <>
                                            <button
                                                className={styles.approveBtn}
                                                onClick={() => { handleStatusChange(selectedRequest.id, 'approved'); setSelectedRequest(null); }}
                                                disabled={!getRequirementsForRequest(selectedRequest).every(req => checkedRequirements[selectedRequest.id + '_' + req.key])}
                                            >
                                                Approve
                                            </button>
                                            <button className={styles.notifyBtn} onClick={() => openNotifyDialog(selectedRequest.id)}>Notify</button>
                                        </>
                                    )}
                                    {selectedRequest.status === 'approved' && (
                                        <>
                                            <button className={styles.printBtn} onClick={() => {
                                                const docs = selectedRequest.documents || [];
                                                let opened = 0;
                                                docs.forEach((doc) => {
                                                    const match = documentFiles.find(f => f.name.toLowerCase() === doc.name.toLowerCase());
                                                    if (match && match.file) {
                                                        const isClearance = /barangay\s*clearance/i.test(doc.name || '');
                                                        if (isClearance && selectedRequest?.id) {
                                                            const dynamicUrl = `/api/admin/documents/print?requestId=${encodeURIComponent(selectedRequest.id)}&docName=${encodeURIComponent(doc.name)}`;
                                                            window.open(dynamicUrl, '_blank');
                                                            opened++;
                                                            return;
                                                        }

                                                        // Fallback for non-migrated document types via API route
                                                        // (avoids bad path transforms like ".pdf.pdf" and keeps logic server-side).
                                                        const printUrl = `/api/admin/documents/print?requestId=${encodeURIComponent(selectedRequest.id)}&file=${encodeURIComponent(match.file)}&docName=${encodeURIComponent(doc.name)}`;
                                                        window.open(printUrl, '_blank');
                                                        opened++;
                                                    }
                                                });
                                                if (opened === 0) showAlert('No documents found', 'No matching document files found. Please upload the document templates in Document Management first.');
                                            }}>🖨 Print</button>
                                            <button
                                                className={styles.releaseBtn}
                                                onClick={() => {
                                                    handleStatusChange(selectedRequest.id, 'for_release');
                                                    setSelectedRequest(null);
                                                }}
                                                disabled={!orBooklet && !selectedRequest.orNumber?.trim()}
                                                title={
                                                    !orBooklet && !selectedRequest.orNumber?.trim()
                                                        ? 'Configure OR booklet in System Settings first'
                                                        : ''
                                                }
                                            >
                                                Mark for Release
                                            </button>
                                        </>
                                    )}
                                    {selectedRequest.status === 'for_release' && (
                                        <button
                                            className={styles.completeBtn}
                                            onClick={() => {
                                                handleStatusChange(selectedRequest.id, 'completed');
                                                setSelectedRequest(null);
                                            }}
                                        >
                                            Mark as Complete
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {/* ── Notify Dialog Modal ── */}
            {showNotifyDialog && (
                <Portal onClose={() => setShowNotifyDialog(false)}>
                    <div className={styles.modalOverlay} onClick={() => setShowNotifyDialog(false)}>
                        <div className={styles.declineDialog} onClick={(e) => e.stopPropagation()}>
                            <h3 className={styles.notifyDialogTitle}>Notify Resident</h3>
                            <p className={styles.declineDialogSubtitle}>Select the missing requirements and/or add notes. The resident will see this in their request tracker.</p>

                            <div className={styles.declineReqList}>
                                <h4 className={styles.declineReqLabel}>Missing Requirements</h4>
                                {notifyReqList.map((req) => (
                                    <label key={req.key} className={styles.notifyReqItem}>
                                        <input
                                            type="checkbox"
                                            checked={!!notifyMissingReqs[req.key]}
                                            onChange={(e) => setNotifyMissingReqs(prev => ({
                                                ...prev,
                                                [req.key]: e.target.checked
                                            }))}
                                        />
                                        <span>{req.label}</span>
                                    </label>
                                ))}
                            </div>

                            <div className={styles.declineNotesSection}>
                                <label className={styles.declineReqLabel}>Additional Notes (optional)</label>
                                <textarea
                                    className={styles.declineNotesInput}
                                    rows={3}
                                    placeholder="e.g. Please submit the Purok Clearance from your purok leader."
                                    value={notifyNotes}
                                    onChange={(e) => setNotifyNotes(e.target.value)}
                                />
                            </div>

                            <div className={styles.declineDialogActions}>
                                <button className={styles.declineCancelBtn} onClick={() => setShowNotifyDialog(false)}>Cancel</button>
                                <button className={styles.notifyConfirmBtn} onClick={handleNotifySubmit}>Send Notification</button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            <button
                type="button"
                className={styles.expiredBtn}
                onClick={() => setShowExpiredModal(true)}
                aria-label="Open expired document requests"
            >
                Expired Documents ({expiredRequests.length})
            </button>

            {showExpiredModal && (
                <Portal onClose={() => setShowExpiredModal(false)}>
                    <div className={styles.modalOverlay} onClick={() => setShowExpiredModal(false)}>
                        <div className={styles.expiredModal} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.expiredHeader}>
                                <h2 className={styles.expiredTitle}>Expired Document Requests</h2>
                                <button className={styles.expiredCloseBtn} onClick={() => setShowExpiredModal(false)}>×</button>
                            </div>
                            <p className={styles.expiredSubtitle}>
                                These requests were automatically archived after exceeding the pending time limit.
                            </p>

                            {expiredRequests.length === 0 ? (
                                <p className={styles.expiredEmpty}>No expired requests found.</p>
                            ) : (
                                <div className={styles.expiredTableWrap}>
                                    <table className={styles.expiredTable}>
                                        <thead>
                                            <tr>
                                                <th>Request No.</th>
                                                <th>Name</th>
                                                <th>Request</th>
                                                <th>Requested On</th>
                                                <th>Expired On</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expiredRequests.map((req) => (
                                                <tr key={req.id}>
                                                    <td>{req.requestNo || '—'}</td>
                                                    <td>{req.residentName || '—'}</td>
                                                    <td>{getDocSummary(req)}</td>
                                                    <td>{formatDate(req.date)}</td>
                                                    <td>{formatDate(req.expiredAt)}</td>
                                                    <td>
                                                        <span className={styles.expiredBadge}>Expired</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </Portal>
            )}
        </div>
        </>
    );
}
