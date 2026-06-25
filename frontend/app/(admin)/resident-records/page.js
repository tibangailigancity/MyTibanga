'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Portal from '@/app/components/Portal';
import { usePolling } from '@/hooks/usePolling';
import { formatChildrenWithAges, formatNameWithDeceased } from '@/lib/residentChildren';
import { readResidentImportFile, RESIDENT_IMPORT_ACCEPT } from '@/lib/residentImportFile';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import ResidentCredentialDialog from '@/components/ResidentCredentialDialog';
import styles from './page.module.css';

export default function ResidentRecordsPage() {
    const router = useRouter();
    const { confirm, prompt, dialogs } = useAppDialogs();
    const [residents, setResidents] = useState([]);
    const [search, setSearch] = useState('');
    const [purokFilter, setPurokFilter] = useState('all');
    const [sexFilter, setSexFilter] = useState('all');
    const [civilStatusFilter, setCivilStatusFilter] = useState('all');
    const [sectorFilter, setSectorFilter] = useState('all');

    // View modal state
    const [viewResident, setViewResident] = useState(null);
    // Archive confirmation state
    const [deleteResident, setDeleteResident] = useState(null);
    const [archiveReason, setArchiveReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [toast, setToast] = useState(null);
    const [showArchivedModal, setShowArchivedModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importCsv, setImportCsv] = useState('');
    const [importPreview, setImportPreview] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [archivedResidents, setArchivedResidents] = useState([]);
    const [archivedLoading, setArchivedLoading] = useState(false);
    const [restoringResidentId, setRestoringResidentId] = useState(null);
    const [purgingResidentId, setPurgingResidentId] = useState(null);
    const [archivedLoadTimedOut, setArchivedLoadTimedOut] = useState(false);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const [resettingPortalId, setResettingPortalId] = useState(null);

    const showToast = useCallback((msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchResidents = () => {
        fetch('/api/admin/residents')
            .then((res) => res.ok ? res.json() : { residents: [] })
            .then((data) => setResidents(data.residents || []))
            .catch(() => { });
    };

    const fetchArchivedResidents = useCallback(async () => {
        setArchivedLoading(true);
        setArchivedLoadTimedOut(false);
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setArchivedLoadTimedOut(true);
            controller.abort();
        }, 12000);
        try {
            const res = await fetch('/api/admin/residents?archived=1', {
                signal: controller.signal,
                cache: 'no-store',
            });
            const data = await res.json().catch(() => ({ residents: [] }));
            setArchivedResidents(data.residents || []);
        } catch {
            setArchivedResidents([]);
        } finally {
            clearTimeout(timer);
            setArchivedLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchResidents();
    }, []);

    usePolling(fetchResidents, 10000);

    // Get unique puroks for the dropdown
    const puroks = [...new Set(residents.map((r) => r.purok))].sort();
    const sectors = [...new Set(residents.map((r) => (r.sector || '').trim()).filter(Boolean))].sort();

    // Filter residents
    const filtered = residents.filter((r) => {
        const matchesSearch =
            !search ||
            `${r.firstName} ${r.middleName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
            r.email?.toLowerCase().includes(search.toLowerCase()) ||
            r.mobileNumber?.includes(search);

        const matchesPurok = purokFilter === 'all' || r.purok === purokFilter;
        const matchesSex = sexFilter === 'all' || r.sex === sexFilter;
        const matchesCivil = civilStatusFilter === 'all' || r.civilStatus === civilStatusFilter;
        const matchesSector = sectorFilter === 'all' || (r.sector || '').trim() === sectorFilter;

        return matchesSearch && matchesPurok && matchesSex && matchesCivil && matchesSector;
    });

    const totalResidents = residents.length;
    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

    const calculateAge = (birthdate) => {
        if (!birthdate) return '—';
        const birth = new Date(birthdate);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const monthDiff = now.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const handleDelete = async () => {
        if (!deleteResident) return;
        const reason = archiveReason.trim();
        if (reason.length < 3) {
            showToast('Please enter an archive reason (at least 3 characters).', 'error');
            return;
        }
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/admin/residents/${deleteResident.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json();
            if (data.success) {
                fetchResidents();
                setDeleteResident(null);
                setArchiveReason('');
                showToast('Resident archived. You can restore from Archived Residents.');
            } else {
                showToast(data.error || 'Failed to archive resident.', 'error');
            }
        } catch {
            showToast('Error archiving resident.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const openArchivedModal = async () => {
        setShowArchivedModal(true);
        await fetchArchivedResidents();
    };

    const handleRestoreResident = async (resident) => {
        if (!resident?.id) return;
        setRestoringResidentId(resident.id);
        try {
            const res = await fetch(`/api/admin/residents/${resident.id}/restore`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showToast(data.error || 'Failed to restore resident.', 'error');
                return;
            }
            showToast(`Restored ${resident.firstName} ${resident.lastName}.`);
            setArchivedResidents((prev) => prev.filter((r) => r.id !== resident.id));
            fetchResidents();
        } catch {
            showToast('Error restoring resident.', 'error');
        } finally {
            setRestoringResidentId(null);
        }
    };

    const handlePurgeResident = async (resident) => {
        if (!resident?.id) return;
        const ok = await confirm({
            title: 'Permanently delete resident?',
            message: `Permanently delete ${resident.firstName} ${resident.lastName}? This cannot be undone.`,
            confirmLabel: 'Continue',
        });
        if (!ok) return;
        const typed = await prompt({
            title: 'Confirm permanent deletion',
            message: 'Type DELETE to confirm permanent deletion:',
            matchText: 'DELETE',
            confirmLabel: 'Delete permanently',
        });
        if (typed !== 'DELETE') {
            showToast('Permanent delete cancelled (confirmation text mismatch).', 'error');
            return;
        }

        setPurgingResidentId(resident.id);
        try {
            const res = await fetch(`/api/admin/residents/${resident.id}/purge`, {
                method: 'DELETE',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showToast(data.error || 'Failed to permanently delete resident.', 'error');
                return;
            }
            showToast(`Permanently deleted ${resident.firstName} ${resident.lastName}.`);
            // Permanent delete only affects archived list; update UI immediately.
            setArchivedResidents((prev) => prev.filter((r) => r.id !== resident.id));
        } catch {
            showToast('Error permanently deleting resident.', 'error');
        } finally {
            setPurgingResidentId(null);
        }
    };

    const CSV_TEMPLATE = `firstName,lastName,middleName,suffix,sex,civilStatus,birthdate,birthplace,religion,purok,barangay,city,mobileNumber,email,sector,children
Juan,Dela Cruz,Maria,,Male,Single,1990-01-15,Iligan City,Roman Catholic,Purok 1,Tibanga,Iligan City,09171234567,juan@example.com,,
`;

    const downloadCsvTemplate = () => {
        const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resident-import-template.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handleImportFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const csv = await readResidentImportFile(file);
            setImportCsv(csv);
            setImportPreview(null);
        } catch (err) {
            showToast(err.message || 'Could not read that file. Use CSV or Excel (.xlsx).', 'error');
        }
    };

    const handleImportSubmit = async () => {
        if (!importCsv.trim()) {
            showToast('Upload a CSV/Excel file or paste CSV content first.', 'error');
            return;
        }
        setIsImporting(true);
        try {
            const res = await fetch('/api/admin/residents/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: importCsv }),
            });
            const data = await res.json();
            setImportPreview(data);
            if (data.importedCount > 0) {
                fetchResidents();
            }
            if (data.errors?.length) {
                showToast(`Imported ${data.importedCount} with ${data.errors.length} error(s). See preview.`, 'error');
            } else if (data.importedCount > 0) {
                showToast(`Successfully imported ${data.importedCount} resident(s).`);
            } else if (data.error) {
                showToast(data.error, 'error');
            }
        } catch {
            showToast('Import failed.', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setImportCsv('');
        setImportPreview(null);
    };

    const openArchiveModal = (resident) => {
        setArchiveReason('');
        setDeleteResident(resident);
    };

    const resetPortalPassword = async (resident) => {
        if (!resident?.id || resettingPortalId) return;
        setResettingPortalId(resident.id);
        try {
            const res = await fetch(`/api/admin/residents/${resident.id}/reset-portal-password`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showToast(data.error || 'Failed to reset portal password.', 'error');
                return;
            }
            setCredentialDialog({
                title: 'New portal password issued',
                residentName: data.residentName || `${resident.firstName} ${resident.lastName}`.trim(),
                username: data.username,
                tempPassword: data.tempPassword,
                smsSent: data.smsSent,
                smsReason: data.smsReason || '',
            });
        } catch {
            showToast('Failed to reset portal password.', 'error');
        } finally {
            setResettingPortalId(null);
        }
    };

    return (
        <>
            {dialogs}
            <ResidentCredentialDialog
                open={!!credentialDialog}
                title={credentialDialog?.title || 'Portal login credentials'}
                residentName={credentialDialog?.residentName}
                username={credentialDialog?.username}
                tempPassword={credentialDialog?.tempPassword}
                smsSent={credentialDialog?.smsSent}
                smsReason={credentialDialog?.smsReason}
                onDone={() => setCredentialDialog(null)}
            />
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div className={styles.headerInfo}>
                    <Link href="/admin-dashboard" className={styles.backBtn}>←</Link>
                    <div>
                        <h1 className={styles.pageTitle}>Total Residence: {totalResidents > 0 ? totalResidents : '1000'}</h1>
                        <p className={styles.pageSubtitle}>Number of recorded residence as of {today}</p>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <button type="button" className={styles.importBtn} onClick={() => setShowImportModal(true)}>
                        Import CSV
                    </button>
                    <Link href="/resident-records/add" className={styles.addBtn}>
                        Add new resident +
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filterBar}>
                <input
                    type="text"
                    placeholder="Search by name, email, or contact..."
                    className={styles.searchInput}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className={styles.filterSelect}
                    value={purokFilter}
                    onChange={(e) => setPurokFilter(e.target.value)}
                >
                    <option value="all">All Puroks</option>
                    {puroks.map((p) => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                </select>
                <select
                    className={styles.filterSelect}
                    value={sexFilter}
                    onChange={(e) => setSexFilter(e.target.value)}
                >
                    <option value="all">All Sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                </select>
                <select
                    className={styles.filterSelect}
                    value={civilStatusFilter}
                    onChange={(e) => setCivilStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Divorced">Divorced</option>
                </select>
                <select
                    className={styles.filterSelect}
                    value={sectorFilter}
                    onChange={(e) => setSectorFilter(e.target.value)}
                >
                    <option value="all">All Sector/Association</option>
                    {sectors.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className={styles.tableSection}>
                <div className={styles.tableInfo}>
                    <span className={styles.resultCount}>
                        Showing {filtered.length} of {totalResidents} residents
                    </span>
                </div>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Sex</th>
                                <th>Civil Status</th>
                                <th>Purok</th>
                                <th>Mobile / landline</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className={styles.emptyRow}>
                                        {residents.length === 0 ? 'Loading residents...' : 'No residents match your filters'}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((r, i) => (
                                    <tr key={r.id}>
                                        <td className={styles.rowNum}>{i + 1}</td>
                                        <td className={styles.nameCell}>
                                            {r.firstName} {r.middleName} {r.lastName} {r.suffix}
                                        </td>
                                        <td>{r.sex}</td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${styles[`status${r.civilStatus}`]}`}>
                                                {r.civilStatus}
                                            </span>
                                        </td>
                                        <td>{r.purok}</td>
                                        <td className={styles.contactCell}>{r.mobileNumber}</td>
                                        <td className={styles.actionCell}>
                                            <button className={styles.viewBtn} onClick={() => setViewResident(r)}>View</button>
                                            <button className={styles.editBtn} onClick={() => router.push(`/resident-records/edit/${r.id}`)}>Edit</button>
                                            <button className={styles.deleteBtn} onClick={() => openArchiveModal(r)}>Archive</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* View Modal */}
            {viewResident && (
                <Portal onClose={() => setViewResident(null)}>
                    <div className={styles.modalOverlay} onClick={() => setViewResident(null)}>
                        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.modalBody}>
                                <button className={styles.modalClose} onClick={() => setViewResident(null)}>×</button>

                                {/* Header with profile picture */}
                                <div className={styles.modalHeader}>
                                    <div className={styles.modalHeaderInfo}>
                                        <h2 className={styles.modalName}>
                                            {viewResident.firstName} {viewResident.middleName} {viewResident.lastName} {viewResident.suffix}
                                        </h2>
                                        <p className={styles.modalDate}>
                                            Registered Date: {viewResident.createdAt
                                                ? new Date(viewResident.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                                : 'N/A'}
                                        </p>
                                        <div className={styles.modalQuickInfo}>
                                            <span>✉ {viewResident.email || '—'}</span>
                                            <span>☎ {viewResident.mobileNumber || '—'}</span>
                                            <span>⌂ {viewResident.purok}, {viewResident.barangay || 'Tibanga'}, {viewResident.city || 'Iligan City'}</span>
                                        </div>
                                    </div>
                                    <div className={styles.modalProfilePic}>
                                        {viewResident.idPicture ? (
                                            <img src={viewResident.idPicture} alt="Profile" />
                                        ) : (
                                            <div className={styles.modalProfilePlaceholder}>
                                                <span>👤</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Resident Information */}
                                <div className={styles.modalSection}>
                                    <h3 className={styles.modalSubtitle}>Resident Information</h3>
                                    <div className={styles.modalGrid}>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>First Name</span>
                                            <span className={styles.modalValue}>{viewResident.firstName}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Middle Name</span>
                                            <span className={styles.modalValue}>{viewResident.middleName || '—'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Last Name</span>
                                            <span className={styles.modalValue}>{viewResident.lastName}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Suffix</span>
                                            <span className={styles.modalValue}>{viewResident.suffix || 'N/A'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Sex</span>
                                            <span className={styles.modalValue}>{viewResident.sex}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Age</span>
                                            <span className={styles.modalValue}>{calculateAge(viewResident.birthdate)}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Civil Status</span>
                                            <span className={styles.modalValue}>{viewResident.civilStatus}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Birth Date</span>
                                            <span className={styles.modalValue}>
                                                {viewResident.birthdate
                                                    ? new Date(viewResident.birthdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                                    : '—'}
                                            </span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Birth Place</span>
                                            <span className={styles.modalValue}>{viewResident.birthplace || '—'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Religion</span>
                                            <span className={styles.modalValue}>{viewResident.religion || '—'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Citizenship</span>
                                            <span className={styles.modalValue}>{viewResident.citizenship || '—'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Solo parent</span>
                                            <span className={styles.modalValue}>{viewResident.soloParent ? 'Yes' : 'No'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Address</span>
                                            <span className={styles.modalValue}>
                                                {viewResident.purok}, {viewResident.barangay || 'Tibanga'}, {viewResident.city || 'Iligan City'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Information */}
                                <div className={styles.modalSection}>
                                    <h3 className={styles.modalSubtitle}>Contact Information</h3>
                                    <div className={styles.modalGrid}>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Mobile number / landline</span>
                                            <span className={styles.modalValue}>{viewResident.mobileNumber || '—'}</span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Email</span>
                                            <span className={styles.modalValue}>{viewResident.email || '—'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Other Information */}
                                <div className={styles.modalSection}>
                                    <h3 className={styles.modalSubtitle}>Other Information</h3>
                                    <div className={styles.modalGrid}>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Mother&apos;s Maiden Name</span>
                                            <span className={styles.modalValue}>
                                                {formatNameWithDeceased(viewResident.mothersMaidenName, viewResident.motherDeceased)}
                                            </span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Father&apos;s Name</span>
                                            <span className={styles.modalValue}>
                                                {formatNameWithDeceased(viewResident.fathersName, viewResident.fatherDeceased)}
                                            </span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Spouse&apos;s Name</span>
                                            <span className={styles.modalValue}>
                                                {formatNameWithDeceased(viewResident.spousesName, viewResident.spouseDeceased)}
                                            </span>
                                        </div>
                                        <div className={styles.modalField}>
                                            <span className={styles.modalLabel}>Children</span>
                                            <span className={styles.modalValue}>
                                                {formatChildrenWithAges(viewResident.children, viewResident.childrenAges)
                                                    || viewResident.childsName
                                                    || '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Account Credentials */}
                                {viewResident.username && (
                                    <div className={styles.modalSection}>
                                        <h3 className={styles.modalSubtitle}>Portal account</h3>
                                        <div className={styles.modalGrid}>
                                            <div className={styles.modalField}>
                                                <span className={styles.modalLabel}>Username</span>
                                                <span className={styles.modalValue}>{viewResident.username}</span>
                                            </div>
                                            <div className={styles.modalField}>
                                                <span className={styles.modalLabel}>Password</span>
                                                <span className={styles.modalValue}>
                                                    Sent by SMS when the account was created. Reset below to send a new one.
                                                </span>
                                            </div>
                                        </div>
                                        <div className={styles.portalResetRow}>
                                            <button
                                                type="button"
                                                className={styles.portalResetBtn}
                                                disabled={resettingPortalId === viewResident.id}
                                                onClick={() => resetPortalPassword(viewResident)}
                                            >
                                                {resettingPortalId === viewResident.id
                                                    ? 'Issuing…'
                                                    : 'Reset portal password'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {/* Archive Confirmation Modal */}
            {deleteResident && (
                <Portal onClose={() => !isDeleting && (setDeleteResident(null), setArchiveReason(''))}>
                    <div className={styles.modalOverlay} onClick={() => !isDeleting && (setDeleteResident(null), setArchiveReason(''))}>
                        <div className={styles.deleteModal} onClick={(e) => e.stopPropagation()}>
                            <h2 className={styles.deleteTitle}>Archive Resident?</h2>
                            <p className={styles.deleteMessage}>
                                Archive <strong>{deleteResident.firstName} {deleteResident.lastName}</strong>?
                                The record will be hidden from the active list but can be restored from Archived Residents.
                            </p>
                            <label className={styles.archiveReasonLabel}>
                                Reason for archiving <span className={styles.requiredMark}>*</span>
                                <textarea
                                    className={styles.archiveReasonInput}
                                    value={archiveReason}
                                    onChange={(e) => setArchiveReason(e.target.value)}
                                    placeholder="Required — e.g. Data Privacy Act request, duplicate record…"
                                    rows={3}
                                    disabled={isDeleting}
                                />
                            </label>
                            <div className={styles.deleteActions}>
                                <button
                                    className={styles.cancelDeleteBtn}
                                    onClick={() => { setDeleteResident(null); setArchiveReason(''); }}
                                    disabled={isDeleting}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={styles.confirmDeleteBtn}
                                    onClick={handleDelete}
                                    disabled={isDeleting || archiveReason.trim().length < 3}
                                >
                                    {isDeleting ? 'Archiving...' : 'Archive'}
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {toast && (
                <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
                    {toast.msg}
                </div>
            )}

            {/* Archived Residents Launcher */}
            <button
                type="button"
                className={styles.archivedBtn}
                onClick={openArchivedModal}
                aria-label="Open archived residents"
            >
                Archived Residents
            </button>

            {/* Archived Residents Modal */}
            {showArchivedModal && (
                <Portal onClose={() => setShowArchivedModal(false)}>
                    <div className={styles.modalOverlay} onClick={() => setShowArchivedModal(false)}>
                        <div className={styles.archivedModal} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.archivedHeader}>
                                <h2 className={styles.archivedTitle}>Archived Residents</h2>
                                <button className={styles.archivedCloseBtn} onClick={() => setShowArchivedModal(false)}>×</button>
                            </div>
                            <p className={styles.archivedSubtitle}>
                                Restore residents that were accidentally deleted.
                            </p>
                            {(restoringResidentId || purgingResidentId) && (
                                <p className={styles.archivedSubtitle}>
                                    Processing action, please wait...
                                </p>
                            )}

                            {archivedLoading ? (
                                <p className={styles.archivedEmpty}>
                                    {archivedLoadTimedOut
                                        ? 'Loading is taking longer than expected. Please close and open again.'
                                        : 'Loading archived residents...'}
                                </p>
                            ) : archivedResidents.length === 0 ? (
                                <p className={styles.archivedEmpty}>No archived residents found.</p>
                            ) : (
                                <div className={styles.archivedTableWrap}>
                                    <table className={styles.archivedTable}>
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Purok</th>
                                                <th>Archived On</th>
                                                <th>Reason</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {archivedResidents.map((r) => (
                                                <tr key={r.id}>
                                                    <td>{r.firstName} {r.middleName} {r.lastName} {r.suffix}</td>
                                                    <td>{r.purok || '—'}</td>
                                                    <td>
                                                        {r.deletedAt ? new Date(r.deletedAt).toLocaleString() : '—'}
                                                    </td>
                                                    <td className={styles.archiveReasonCell}>
                                                        {r.archiveReason?.trim() || '—'}
                                                    </td>
                                                    <td>
                                                        <div className={styles.archivedActions}>
                                                            <button
                                                                className={styles.restoreBtn}
                                                                onClick={() => handleRestoreResident(r)}
                                                                disabled={restoringResidentId === r.id || purgingResidentId === r.id}
                                                            >
                                                                {restoringResidentId === r.id ? 'Restoring...' : 'Restore'}
                                                            </button>
                                                            <button
                                                                className={styles.purgeBtn}
                                                                onClick={() => handlePurgeResident(r)}
                                                                disabled={purgingResidentId === r.id || restoringResidentId === r.id}
                                                            >
                                                                {purgingResidentId === r.id ? 'Deleting...' : 'Delete'}
                                                            </button>
                                                        </div>
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

            {/* CSV Import Modal */}
            {showImportModal && (
                <Portal onClose={closeImportModal}>
                    <div className={styles.modalOverlay} onClick={closeImportModal}>
                        <div className={styles.importModal} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.importHeader}>
                                <h2 className={styles.importTitle}>Import Residents from CSV or Excel</h2>
                                <button type="button" className={styles.importCloseBtn} onClick={closeImportModal}>×</button>
                            </div>
                            <p className={styles.importHint}>
                                Upload a .csv or .xlsx file. Required columns: firstName, lastName, purok. Optional: middleName, sex, civilStatus, birthdate, mobileNumber, email, sector, children (semicolon-separated).
                            </p>
                            <div className={styles.importActions}>
                                <button type="button" className={styles.importTemplateBtn} onClick={downloadCsvTemplate}>
                                    Download template
                                </button>
                                <label className={styles.importUploadBtn}>
                                    Choose file
                                    <input type="file" accept={RESIDENT_IMPORT_ACCEPT} onChange={handleImportFile} className={styles.importFileInput} />
                                </label>
                            </div>
                            <textarea
                                className={styles.importTextarea}
                                value={importCsv}
                                onChange={(e) => { setImportCsv(e.target.value); setImportPreview(null); }}
                                placeholder="Or paste CSV content here…"
                                rows={8}
                            />
                            {importPreview && (
                                <div className={styles.importResult}>
                                    <p>Imported: {importPreview.importedCount ?? 0}</p>
                                    {(importPreview.importedCount ?? 0) > 0 && (
                                        <p className={styles.importCredentialNote}>
                                            Portal accounts created. Passwords were sent by SMS where mobile numbers
                                            are valid. Use Reset portal password on a record if a resident did not receive theirs.
                                        </p>
                                    )}
                                    {(importPreview.errors || []).length > 0 && (
                                        <ul className={styles.importErrorList}>
                                            {importPreview.errors.map((err) => (
                                                <li key={err.row}>Row {err.row}: {err.message}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                            <div className={styles.importFooter}>
                                <button type="button" className={styles.cancelDeleteBtn} onClick={closeImportModal} disabled={isImporting}>
                                    Close
                                </button>
                                <button type="button" className={styles.addBtn} onClick={handleImportSubmit} disabled={isImporting || !importCsv.trim()}>
                                    {isImporting ? 'Importing...' : 'Import'}
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
        </>
    );
}
