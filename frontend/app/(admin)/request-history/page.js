'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Portal from '@/app/components/Portal';
import { usePolling } from '@/hooks/usePolling';
import { getRequirementsForDocuments } from '@/lib/documentRequirements';
import styles from './page.module.css';

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending', color: '#ff9800' },
    { value: 'approved', label: 'Validation', color: '#2196f3' },
    { value: 'for_release', label: 'For Release', color: '#4caf50' },
    { value: 'completed', label: 'Done', color: '#0147AE' },
    { value: 'expired', label: 'Expired', color: '#b45309' },
];

function formatPaymentMethod(method) {
    const value = String(method || '').toLowerCase();
    if (value === 'gcash') return 'Online (GCash)';
    if (value === 'bank') return 'Online (Bank Transfer)';
    if (value === 'online') return 'Online';
    return 'Cash';
}

export default function RequestHistoryPage() {
    const [requests, setRequests] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [documentRequirementsMap, setDocumentRequirementsMap] = useState({});

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
        return getRequirementsForDocuments(names, documentRequirementsMap);
    };

    const fetchRequests = useCallback(() => {
        fetch('/api/admin/requests')
            .then((res) => res.json())
            .then((data) => setRequests(data.requests || []))
            .catch(() => setRequests([]));
    }, []);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    // Request list can be heavy; poll less often to keep UI responsive.
    usePolling(fetchRequests, 30000);

    const visibleRequests = requests.filter((r) => r.status !== 'rejected' && r.status !== 'declined');

    const filtered = visibleRequests
        .filter((r) => statusFilter === 'all' || r.status === statusFilter)
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

    // Count by status
    const counts = {
        all: visibleRequests.length,
        pending: visibleRequests.filter((r) => r.status === 'pending').length,
        approved: visibleRequests.filter((r) => r.status === 'approved').length,
        for_release: visibleRequests.filter((r) => r.status === 'for_release').length,
        completed: visibleRequests.filter((r) => r.status === 'completed').length,
        expired: visibleRequests.filter((r) => r.status === 'expired').length,
    };

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div className={styles.headerInfo}>
                    <Link href="/admin-dashboard" className={styles.backBtn}>←</Link>
                    <div>
                        <h1 className={styles.pageTitle}>Request History</h1>
                        <p className={styles.pageSubtitle}>History of document requests</p>
                    </div>
                </div>
            </div>

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
            </div>

            {/* Table */}
            <div className={styles.tableSection}>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Request</th>
                                <th>Date</th>
                                <th>Expired On</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className={styles.emptyRow}>No requests found.</td>
                                </tr>
                            ) : (
                                paginated.map((req) => {
                                    const statusInfo = getStatusInfo(req.status);
                                    return (
                                        <tr key={req.id}>
                                            <td className={styles.nameCell}>{req.residentName}</td>
                                            <td>{getDocSummary(req)}</td>
                                            <td className={styles.dateCell}>{formatDate(req.date)}</td>
                                            <td className={styles.dateCell}>
                                                {req.status === 'expired' ? formatDate(req.expiredAt) : '—'}
                                            </td>
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
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
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

            {/* View Modal (Read-Only) */}
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
                                    {selectedRequest.status === 'expired' && (
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Expired On</span>
                                            <span className={styles.modalValue}>{formatDate(selectedRequest.expiredAt)}</span>
                                        </div>
                                    )}
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
                                    <span className={styles.modalValue}>
                                        {selectedRequest.orNumber?.trim() ? selectedRequest.orNumber : '—'}
                                    </span>
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

                                <div className={styles.purposeSection}>
                                    <h3 className={styles.docListTitle}>Purpose</h3>
                                    <p className={styles.purposeDisplay}>
                                        {selectedRequest.purpose?.trim() ? selectedRequest.purpose : '—'}
                                    </p>
                                </div>

                                <div className={styles.requirementsSection}>
                                    <h3 className={styles.docListTitle}>Requirements</h3>
                                    {getRequirementsForRequest(selectedRequest).map((req) => (
                                        <div key={req} className={styles.requirementItem}>
                                            <span>• {req}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Rejection Reason */}
                                {selectedRequest.rejectionReason && (
                                    <div className={styles.rejectionBox}>
                                        <strong>Rejection Reason:</strong> {selectedRequest.rejectionReason}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
}
