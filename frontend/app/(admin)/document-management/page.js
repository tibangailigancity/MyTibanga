'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Portal from '@/app/components/Portal';
import { usePolling } from '@/hooks/usePolling';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import styles from './page.module.css';

export default function DocumentManagementPage() {
    const { showAlert, confirm, dialogs } = useAppDialogs();
    const [documents, setDocuments] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [previewDoc, setPreviewDoc] = useState(null);
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadRequiresPurpose, setUploadRequiresPurpose] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);
    const fileRef = useRef(null);
    const previewRef = useRef(null);
    const updateFileRef = useRef(null);

    const fetchDocuments = async () => {
        try {
            const res = await fetch('/api/admin/documents');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showAlert(
                    'Could not load documents',
                    data.error || 'Check database and Supabase Storage settings.'
                );
                setDocuments([]);
                return;
            }
            setDocuments(data.documents || []);
        } catch {
            showAlert('Could not load documents', 'Check your connection and try again.');
            setDocuments([]);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    usePolling(fetchDocuments, 10000);

    const filtered = documents.filter((doc) =>
        doc.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }) + '\n' + d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    const handleUpload = async () => {
        const file = fileRef.current?.files[0];
        if (!file) {
            showAlert('No file selected', 'Please select a file.');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', uploadName || file.name.replace(/\.[^/.]+$/, ''));

        formData.append('requiresPurpose', uploadRequiresPurpose ? 'true' : 'false');

        const previewFile = previewRef.current?.files[0];
        if (previewFile) {
            formData.append('preview', previewFile);
        }

        try {
            const res = await fetch('/api/admin/documents', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                const msg = data.error || `Upload failed (${res.status})`;
                showAlert(
                    'Upload failed',
                    msg.includes('SUPABASE') || msg.includes('Storage') || msg.includes('bucket')
                        ? `${msg}\n\nCheck Vercel env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and create a Storage bucket named "documents".`
                        : msg
                );
                return;
            }
            await fetchDocuments();
            setShowUpload(false);
            setUploadName('');
            setUploadRequiresPurpose(false);
            if (fileRef.current) fileRef.current.value = '';
            if (previewRef.current) previewRef.current.value = '';
        } catch {
            showAlert('Upload error', 'Check the terminal or browser Network tab for details.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (doc) => {
        const ok = await confirm({
            title: 'Delete document?',
            message: `Delete "${doc.name}"? This will remove the file permanently.`,
            confirmLabel: 'Delete',
        });
        if (!ok) return;

        try {
            const res = await fetch('/api/admin/documents', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: doc.id }),
            });
            const data = await res.json();
            if (data.success) {
                fetchDocuments();
                if (previewDoc?.id === doc.id) setPreviewDoc(null);
            } else {
                showAlert('Delete failed', data.error || res.statusText || 'Unknown error');
            }
        } catch {
            showAlert('Delete failed', 'Could not delete the document.');
        }
    };

    const triggerUpdate = (docId) => {
        setUpdatingId(docId);
        updateFileRef.current?.click();
    };

    const handleUpdate = async (e) => {
        const file = e.target.files[0];
        if (!file || !updatingId) return;

        const formData = new FormData();
        formData.append('id', updatingId);
        formData.append('file', file);

        try {
            const res = await fetch('/api/admin/documents', {
                method: 'PATCH',
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                fetchDocuments();
            } else {
                showAlert('Update failed', data.error || 'Unknown error');
            }
        } catch {
            showAlert('Update failed', 'Could not update the document.');
        } finally {
            setUpdatingId(null);
            if (updateFileRef.current) updateFileRef.current.value = '';
        }
    };

    const toggleRequiresPurpose = async (doc) => {
        try {
            const res = await fetch('/api/admin/documents', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: doc.id, requiresPurpose: !doc.requiresPurpose }),
            });
            const data = await res.json();
            if (data.success) fetchDocuments();
            else showAlert('Update failed', data.error || 'Could not update purpose setting');
        } catch {
            showAlert('Update failed', 'Could not update purpose setting');
        }
    };

    return (
        <>
            {dialogs}
        <div className={styles.page}>
            {/* Hidden file input for update */}
            <input type="file" ref={updateFileRef} style={{ display: 'none' }} onChange={handleUpdate} />
            {/* Header */}
            <div className={styles.pageHeader}>
                <div className={styles.headerInfo}>
                    <Link href="/admin-dashboard" className={styles.backBtn}>←</Link>
                    <div>
                        <h1 className={styles.pageTitle}>Document Management</h1>
                        <p className={styles.pageSubtitle}>Barangay document repository</p>
                    </div>
                </div>
                <button className={styles.uploadToggleBtn} onClick={() => setShowUpload(!showUpload)}>
                    {showUpload ? 'Cancel' : '+ Upload Document'}
                </button>
            </div>

            {/* Upload Form */}
            {showUpload && (
                <div className={styles.uploadSection}>
                    <div className={styles.uploadField}>
                        <label className={styles.uploadLabel}>Document Name</label>
                        <input
                            type="text"
                            className={styles.uploadInput}
                            placeholder="e.g. Barangay Clearance"
                            value={uploadName}
                            onChange={(e) => setUploadName(e.target.value)}
                        />
                    </div>
                    <div className={styles.uploadField}>
                        <label className={styles.uploadLabel}>Document File (.docx, .pdf, etc.)</label>
                        <input type="file" ref={fileRef} className={styles.uploadFileInput} />
                    </div>
                    <div className={styles.uploadField}>
                        <label className={styles.uploadLabel}>Preview Image (optional, .jpg/.png)</label>
                        <input type="file" ref={previewRef} accept="image/*" className={styles.uploadFileInput} />
                    </div>
                    <div className={styles.uploadField}>
                        <label className={styles.uploadCheckboxLabel}>
                            <input
                                type="checkbox"
                                checked={uploadRequiresPurpose}
                                onChange={(e) => setUploadRequiresPurpose(e.target.checked)}
                            />
                            <span>Print purpose on this certificate</span>
                        </label>
                    </div>
                    <button className={styles.uploadSubmitBtn} onClick={handleUpload} disabled={uploading}>
                        {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            )}

            {/* Search */}
            <div className={styles.filterBar}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Document Table */}
            <div className={styles.tableSection}>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Print purpose</th>
                                <th>Action</th>
                                <th>Date Modified</th>
                                <th>Date Uploaded</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className={styles.emptyRow}>No documents found.</td>
                                </tr>
                            ) : (
                                filtered.map((doc) => (
                                    <tr key={doc.id}>
                                        <td className={styles.nameCell}>{doc.name}</td>
                                        <td className={styles.purposeCell}>
                                            <label className={styles.purposeToggleLabel}>
                                                <input
                                                    type="checkbox"
                                                    checked={doc.requiresPurpose === true}
                                                    onChange={() => toggleRequiresPurpose(doc)}
                                                />
                                                <span>{doc.requiresPurpose ? 'Yes' : 'No'}</span>
                                            </label>
                                        </td>
                                        <td className={styles.actionCell}>
                                            {doc.preview && (
                                                <button className={styles.previewBtn} onClick={() => setPreviewDoc(doc)}>Preview</button>
                                            )}
                                            <a href={doc.file} download className={styles.downloadBtn}>Download</a>
                                            <button className={styles.updateDocBtn} onClick={() => triggerUpdate(doc.id)}>Update</button>
                                            <button className={styles.deleteDocBtn} onClick={() => handleDelete(doc)}>Delete</button>
                                        </td>
                                        <td className={styles.dateCell}>{formatDate(doc.dateModified)}</td>
                                        <td className={styles.dateCell}>{formatDate(doc.dateUploaded)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Preview Modal */}
            {previewDoc && (
                <Portal onClose={() => setPreviewDoc(null)}>
                    <div className={styles.modalOverlay} onClick={() => setPreviewDoc(null)}>
                        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.modalBody}>
                                <button className={styles.modalClose} onClick={() => setPreviewDoc(null)}>×</button>
                                <h2 className={styles.modalTitle}>{previewDoc.name}</h2>
                                <div className={styles.previewImageContainer}>
                                    <img
                                        src={previewDoc.preview}
                                        alt={previewDoc.name}
                                        className={styles.previewImage}
                                    />
                                </div>
                                <div className={styles.modalActions}>
                                    <a href={previewDoc.file} download className={styles.downloadBtnLarge}>
                                        Download
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
        </>
    );
}
