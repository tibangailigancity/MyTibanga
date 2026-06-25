'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import styles from './page.module.css';

const FaceScanner = dynamic(() => import('@/components/FaceScanner'), { ssr: false });

const ALL_TABS = [
    { key: 'profile', label: 'Admin Profile', permission: null }, // always visible
    { key: 'fees', label: 'Document & Fees', permission: 'fees' },
    { key: 'request-config', label: 'Request Settings', permission: 'fees' },
    { key: 'or-booklet', label: 'Official Receipt (OR)', permission: 'fees' },
    { key: 'request-expiry', label: 'Request Expiry', permission: 'request-expiry' },
    { key: 'announcements', label: 'Announcements', permission: 'announcements' },
    { key: 'puroks', label: 'Purok List', permission: 'puroks' },
    { key: 'admin-management', label: 'Admin Management', permission: 'admin-management' },
];

const AVAILABLE_PERMISSIONS = [
    { key: 'fees', label: 'Document & Fees' },
    { key: 'request-expiry', label: 'Request Expiry' },
    { key: 'announcements', label: 'Announcements' },
    { key: 'puroks', label: 'Purok List' },
];

export default function SystemSettingsPage() {
    const { confirm, dialogs } = useAppDialogs();
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    // Data
    const [profile, setProfile] = useState(null);
    const [fees, setFees] = useState([]);
    const [paymentConfig, setPaymentConfig] = useState({
        onlinePaymentEnabled: true,
        gcash: { accountName: '', accountNumber: '', qrImageUrl: '' },
        bank: { bankName: '', accountName: '', accountNumber: '' },
    });
    const [paymentSavedAt, setPaymentSavedAt] = useState('');
    const [qrUploading, setQrUploading] = useState(false);
    const [qrPreviewUrl, setQrPreviewUrl] = useState('');
    const [pendingExpiryDays, setPendingExpiryDays] = useState(3);
    const [cameraLoginEnabled, setCameraLoginEnabled] = useState(true);
    const [requestExpirySavedAt, setRequestExpirySavedAt] = useState('');
    const [orBookletForm, setOrBookletForm] = useState({ nextOr: '', endOr: '', notes: '' });
    const [orBookletSavedAt, setOrBookletSavedAt] = useState('');
    const [cameraLoginSavedAt, setCameraLoginSavedAt] = useState('');
    const [announcements, setAnnouncements] = useState([]);
    const [puroks, setPuroks] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [adminUsers, setAdminUsers] = useState([]);
    const [commonPurposes, setCommonPurposes] = useState([]);
    const [documentRequirements, setDocumentRequirements] = useState({});
    const [newPurpose, setNewPurpose] = useState('');
    const [requestConfigSavedAt, setRequestConfigSavedAt] = useState('');

    // Profile form
    const [profileForm, setProfileForm] = useState({ name: '', email: '', currentPassword: '', newPassword: '', confirmPassword: '' });

    // Announcement modal
    const [annModal, setAnnModal] = useState(null);
    const [annForm, setAnnForm] = useState({ title: '', content: '' });

    // Purok add
    const [newPurok, setNewPurok] = useState('');
    const [editPurok, setEditPurok] = useState(null);

    // Admin modal
    const [adminModal, setAdminModal] = useState(null); // null = closed, {} = add, {id,...} = edit
    const [adminForm, setAdminForm] = useState({ name: '', username: '', email: '', password: '', permissions: [] });

    // Face enrollment
    const [faceEnrolled, setFaceEnrolled] = useState(false);
    const [showFaceScanner, setShowFaceScanner] = useState(false);
    const [faceLoading, setFaceLoading] = useState(false);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        try {
            const res = await fetch('/api/admin/settings');
            if (!res.ok) throw new Error();
            const data = await res.json();
            setProfile(data.profile);
            setProfileForm({ name: data.profile?.name || '', email: data.profile?.email || '', currentPassword: '', newPassword: '', confirmPassword: '' });
            setFees(data.documentFees || []);
            setPaymentConfig({
                onlinePaymentEnabled: data.paymentConfig?.onlinePaymentEnabled !== false,
                gcash: data.paymentConfig?.gcash || { accountName: '', accountNumber: '', qrImageUrl: '' },
                bank: data.paymentConfig?.bank || { bankName: '', accountName: '', accountNumber: '' },
            });
            setQrPreviewUrl(data.paymentConfig?.gcash?.qrImageUrl || '');
            setPendingExpiryDays(Number(data.pendingExpiryDays) > 0 ? Number(data.pendingExpiryDays) : 3);
            setCameraLoginEnabled(data.cameraLoginEnabled !== false);
            setAnnouncements(data.announcements || []);
            setPuroks(data.puroks || []);
            setPermissions(data.permissions || []);
            setIsSuperAdmin(data.isSuperAdmin || false);
            setAdminUsers(data.adminUsers || []);
            setCommonPurposes(Array.isArray(data.commonPurposes) ? data.commonPurposes : []);
            setDocumentRequirements(
                data.documentRequirements && typeof data.documentRequirements === 'object'
                    ? data.documentRequirements
                    : {}
            );
            if (data.orBooklet) {
                setOrBookletForm({
                    nextOr: String(data.orBooklet.nextOr ?? ''),
                    endOr: String(data.orBooklet.endOr ?? ''),
                    notes: data.orBooklet.notes || '',
                });
            } else {
                setOrBookletForm({ nextOr: '', endOr: '', notes: '' });
            }

            // Fetch face enrollment status
            try {
                const faceRes = await fetch('/api/admin/enroll-face');
                if (faceRes.ok) {
                    const faceData = await faceRes.json();
                    setFaceEnrolled(faceData.enrolled);
                    if (typeof faceData.cameraLoginEnabled === 'boolean') {
                        setCameraLoginEnabled(faceData.cameraLoginEnabled);
                    }
                }
            } catch { /* ignore */ }
        } catch {
            showToast('Failed to load settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Filter tabs based on permissions
    const visibleTabs = ALL_TABS.filter((tab) => {
        if (tab.permission === null) return true; // profile always visible
        if (tab.key === 'request-expiry') {
            return permissions.includes('request-expiry') || permissions.includes('fees');
        }
        return permissions.includes(tab.permission);
    });

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const apiPatch = async (body) => {
        const res = await fetch('/api/admin/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.json();
    };

    // ── Profile ──
    const handleProfileSave = async () => {
        if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        const payload = { section: 'profile', name: profileForm.name, email: profileForm.email };
        if (profileForm.newPassword) {
            payload.currentPassword = profileForm.currentPassword;
            payload.newPassword = profileForm.newPassword;
        }
        const data = await apiPatch(payload);
        if (data.success) {
            if (data.profile) setProfile(data.profile);
            setProfileForm((p) => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
            showToast('Profile updated');
        } else {
            showToast(data.error || 'Failed to update', 'error');
        }
    };

    // ── Fees ──
    const handleFeeChange = (idx, val) => {
        setFees((prev) => prev.map((f, i) => (i === idx ? { ...f, fee: Number(val) || 0 } : f)));
    };

    const handleFeesSave = async () => {
        const gcashDigits = String(paymentConfig.gcash?.accountNumber || '').replace(/\D/g, '');
        const bankDigits = String(paymentConfig.bank?.accountNumber || '').replace(/\D/g, '');
        if (gcashDigits && (gcashDigits.length < 10 || gcashDigits.length > 13)) {
            showToast('GCash number must be 10 to 13 digits', 'error');
            return;
        }
        if (bankDigits && (bankDigits.length < 8 || bankDigits.length > 24)) {
            showToast('Bank account number must be 8 to 24 digits', 'error');
            return;
        }
        const data = await apiPatch({ section: 'fees', documentFees: fees, paymentConfig });
        if (data.success) {
            setPaymentSavedAt(new Date().toLocaleString());
            showToast('Fees updated');
        }
        else showToast(data.error || 'Failed to update fees', 'error');
    };

    const setPaymentField = (group, key, value) => {
        setPaymentConfig((prev) => ({
            ...prev,
            [group]: {
                ...(prev[group] || {}),
                [key]: value,
            },
        }));
    };

    const formatBankAccountNumber = (value) => {
        const digitsOnly = String(value || '').replace(/\D/g, '');
        const grouped = digitsOnly.match(/.{1,4}/g) || [];
        return grouped.join(' ');
    };

    const handleGcashQrUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setQrUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/admin/payment-qr', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.qrImageKey) {
                showToast(data.error || 'Failed to upload GCash QR image', 'error');
                return;
            }
            setPaymentField('gcash', 'qrImageUrl', data.qrImageKey);
            if (data.qrImageUrl) setQrPreviewUrl(data.qrImageUrl);
            showToast('GCash QR uploaded. Click Save Fees & Payment Info to apply.');
        } catch {
            showToast('Failed to upload GCash QR image', 'error');
        } finally {
            setQrUploading(false);
        }
    };

    // ── OR Booklet ──
    const handleOrBookletSave = async () => {
        const nextOr = Number.parseInt(String(orBookletForm.nextOr), 10);
        const endOr = Number.parseInt(String(orBookletForm.endOr), 10);
        if (!Number.isFinite(nextOr) || !Number.isFinite(endOr) || nextOr < 1 || endOr < 1) {
            showToast('Next OR and last OR must be positive numbers', 'error');
            return;
        }
        if (nextOr > endOr) {
            showToast('Next OR cannot be greater than the last OR in the booklet', 'error');
            return;
        }
        const data = await apiPatch({
            section: 'or-booklet',
            nextOr,
            endOr,
            notes: orBookletForm.notes,
        });
        if (data.success) {
            if (data.orBooklet) {
                setOrBookletForm({
                    nextOr: String(data.orBooklet.nextOr),
                    endOr: String(data.orBooklet.endOr),
                    notes: data.orBooklet.notes || '',
                });
            }
            setOrBookletSavedAt(new Date().toLocaleString());
            showToast('OR booklet updated');
        } else {
            showToast(data.error || 'Failed to update OR booklet', 'error');
        }
    };

    const orBookletRemaining =
        Number.isFinite(Number(orBookletForm.nextOr)) &&
        Number.isFinite(Number(orBookletForm.endOr)) &&
        Number(orBookletForm.nextOr) >= 1 &&
        Number(orBookletForm.endOr) >= Number(orBookletForm.nextOr)
            ? Number(orBookletForm.endOr) - Number(orBookletForm.nextOr) + 1
            : null;

    // ── Request Expiry ──
    const handleRequestExpirySave = async () => {
        const parsedDays = Number(pendingExpiryDays);
        if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 365) {
            showToast('Pending expiry days must be between 1 and 365', 'error');
            return;
        }
        const data = await apiPatch({
            section: 'request-expiry',
            pendingExpiryDays: Math.floor(parsedDays),
        });
        if (data.success) {
            setPendingExpiryDays(data.pendingExpiryDays);
            setRequestExpirySavedAt(new Date().toLocaleString());
            showToast('Request expiry setting updated');
        } else {
            showToast(data.error || 'Failed to update request expiry', 'error');
        }
    };

    // ── Announcements ──
    const openAnnModal = (ann = null) => {
        setAnnModal(ann || {});
        setAnnForm(ann ? { title: ann.title, content: ann.content } : { title: '', content: '' });
    };

    const handleAnnSave = async () => {
        if (!annForm.title.trim()) { showToast('Title is required', 'error'); return; }
        const action = annModal.id ? 'edit' : 'add';
        const announcement = annModal.id ? { id: annModal.id, ...annForm } : { ...annForm, author: profile?.name || 'Admin' };
        const data = await apiPatch({ section: 'announcements', action, announcement });
        if (data.success) {
            setAnnouncements(data.announcements);
            setAnnModal(null);
            showToast(action === 'add' ? 'Announcement added' : 'Announcement updated');
        } else {
            showToast(data.error || 'Failed', 'error');
        }
    };

    const handleAnnDelete = async (id) => {
        const ok = await confirm({
            title: 'Delete announcement?',
            message: 'Delete this announcement?',
            confirmLabel: 'Delete',
        });
        if (!ok) return;
        const data = await apiPatch({ section: 'announcements', action: 'delete', announcement: { id } });
        if (data.success) {
            setAnnouncements(data.announcements);
            showToast('Announcement deleted');
        }
    };

    // ── Puroks ──
    const handleAddPurok = async () => {
        if (!newPurok.trim()) return;
        const data = await apiPatch({ section: 'puroks', action: 'add', purok: newPurok.trim() });
        if (data.success) {
            setPuroks(data.puroks);
            setNewPurok('');
            showToast('Purok added');
        } else {
            showToast(data.error || 'Failed', 'error');
        }
    };

    const handleRenamePurok = async (oldName, newName) => {
        if (!newName.trim() || newName === oldName) { setEditPurok(null); return; }
        const data = await apiPatch({ section: 'puroks', action: 'rename', purok: oldName, newName: newName.trim() });
        if (data.success) {
            setPuroks(data.puroks);
            setEditPurok(null);
            showToast('Purok renamed');
        } else {
            showToast(data.error || 'Failed', 'error');
        }
    };

    const handleDeletePurok = async (name) => {
        const ok = await confirm({
            title: 'Delete purok?',
            message: `Delete "${name}"?`,
            confirmLabel: 'Delete',
        });
        if (!ok) return;
        const data = await apiPatch({ section: 'puroks', action: 'delete', purok: name });
        if (data.success) {
            setPuroks(data.puroks);
            showToast('Purok deleted');
        }
    };

    // ── Admin Management ──
    const openAdminModal = (admin = null) => {
        setAdminModal(admin || {});
        if (admin && admin.id) {
            setAdminForm({ name: admin.name, username: admin.username, email: admin.email, password: '', permissions: admin.permissions || [] });
        } else {
            setAdminForm({ name: '', username: '', email: '', password: '', permissions: [] });
        }
    };

    const toggleAdminPermission = (perm) => {
        setAdminForm((prev) => ({
            ...prev,
            permissions: prev.permissions.includes(perm)
                ? prev.permissions.filter((p) => p !== perm)
                : [...prev.permissions, perm],
        }));
    };

    const handleAdminSave = async () => {
        if (!adminForm.name.trim() || !adminForm.username.trim()) {
            showToast('Name and username are required', 'error');
            return;
        }
        if (!adminModal.id && !adminForm.password) {
            showToast('Initial password is required for a new admin account', 'error');
            return;
        }

        const action = adminModal.id ? 'edit' : 'add';
        const payload = { section: 'admin-management', action };

        if (action === 'add') {
            payload.name = adminForm.name;
            payload.username = adminForm.username;
            payload.email = adminForm.email;
            payload.password = adminForm.password;
            payload.permissions = adminForm.permissions;
        } else {
            payload.adminId = adminModal.id;
            payload.name = adminForm.name;
            payload.email = adminForm.email;
            payload.permissions = adminForm.permissions;
            if (adminForm.password) payload.password = adminForm.password;
        }

        const data = await apiPatch(payload);
        if (data.success) {
            setAdminUsers(data.adminUsers);
            setAdminModal(null);
            showToast(action === 'add' ? 'Admin added' : 'Admin updated');
        } else {
            showToast(data.error || 'Failed', 'error');
        }
    };

    const handleAdminDelete = async (id) => {
        const ok = await confirm({
            title: 'Delete admin account?',
            message: 'Delete this admin account?',
            confirmLabel: 'Delete',
        });
        if (!ok) return;
        const data = await apiPatch({ section: 'admin-management', action: 'delete', adminId: id });
        if (data.success) {
            setAdminUsers(data.adminUsers);
            showToast('Admin deleted');
        } else {
            showToast(data.error || 'Failed', 'error');
        }
    };

    // ── Face Enrollment ──
    const handleFaceEnroll = async (image) => {
        setFaceLoading(true);
        const controller = new AbortController();
        const timeoutMs = 120000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch('/api/admin/enroll-face', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image }),
                signal: controller.signal,
            });
            const data = await res.json();
            if (data.success) {
                setFaceEnrolled(true);
                setShowFaceScanner(false);
                showToast('Face enrolled successfully');
            } else {
                showToast(data.error || 'Failed to enroll face', 'error');
                setShowFaceScanner(false);
            }
        } catch (err) {
            if (err?.name === 'AbortError') {
                showToast('Enrollment took too long. Try again — the server may still be loading face models.', 'error');
            } else {
                showToast('Failed to enroll face', 'error');
            }
            setShowFaceScanner(false);
        } finally {
            clearTimeout(timeoutId);
            setFaceLoading(false);
        }
    };

    const handleFaceRemove = async () => {
        const ok = await confirm({
            title: 'Remove face data?',
            message: 'Remove your face data? You will need to re-enroll to use face login.',
            confirmLabel: 'Remove',
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/admin/enroll-face', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setFaceEnrolled(false);
                showToast('Face data removed');
            } else {
                showToast(data.error || 'Failed to remove face data', 'error');
            }
        } catch {
            showToast('Failed to remove face data', 'error');
        }
    };

    const handleCameraLoginSave = async () => {
        const data = await apiPatch({
            section: 'camera-login',
            cameraLoginEnabled,
        });
        if (data.success) {
            setCameraLoginEnabled(data.cameraLoginEnabled !== false);
            setCameraLoginSavedAt(new Date().toLocaleString());
            showToast(`Camera login ${data.cameraLoginEnabled ? 'enabled' : 'disabled'}`);
            if (!data.cameraLoginEnabled) {
                setShowFaceScanner(false);
            }
        } else {
            showToast(data.error || 'Failed to update camera login setting', 'error');
        }
    };

    const handleRequestConfigSave = async () => {
        const data = await apiPatch({
            section: 'request-config',
            commonPurposes: commonPurposes.filter(Boolean),
            documentRequirements,
        });
        if (data.success) {
            setRequestConfigSavedAt(new Date().toLocaleString());
            showToast('Request settings updated');
        } else {
            showToast(data.error || 'Failed to update request settings', 'error');
        }
    };

    const addPurpose = () => {
        const p = newPurpose.trim();
        if (!p) return;
        if (!commonPurposes.includes(p)) {
            setCommonPurposes((prev) => [...prev, p]);
        }
        setNewPurpose('');
    };

    const removePurpose = (p) => {
        setCommonPurposes((prev) => prev.filter((x) => x !== p));
    };

    const setDocRequirementsText = (docName, text) => {
        const list = String(text).split('\n').map((s) => s.trim()).filter(Boolean);
        setDocumentRequirements((prev) => ({ ...prev, [docName]: list }));
    };

    // ── Format date ──
    const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (loading) return <div className={styles.loadingState}>Loading settings…</div>;

    const currentTabKey = visibleTabs[activeTab]?.key;

    return (
        <>
            {dialogs}
        <div className={styles.settings}>
            {/* Tabs */}
            <div className={styles.tabs}>
                {visibleTabs.map((t, i) => (
                    <button key={t.key} className={`${styles.tab} ${activeTab === i ? styles.tabActive : ''}`} onClick={() => setActiveTab(i)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: Profile ── */}
            {currentTabKey === 'profile' && (
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Admin Profile</h3>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Full Name</label>
                            <input className={styles.formInput} value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Email</label>
                            <input className={styles.formInput} type="email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Username</label>
                        <input className={styles.formInput} value={profile?.username || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                    </div>
                    <h3 className={styles.cardTitle} style={{ marginTop: 28 }}>Change Password</h3>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Current Password</label>
                        <input className={styles.formInput} type="password" value={profileForm.currentPassword} onChange={(e) => setProfileForm((p) => ({ ...p, currentPassword: e.target.value }))} />
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>New Password</label>
                            <input className={styles.formInput} type="password" value={profileForm.newPassword} onChange={(e) => setProfileForm((p) => ({ ...p, newPassword: e.target.value }))} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Confirm Password</label>
                            <input className={styles.formInput} type="password" value={profileForm.confirmPassword} onChange={(e) => setProfileForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
                        </div>
                    </div>
                    <div className={styles.btnRow}>
                        <button className={styles.btnPrimary} onClick={handleProfileSave}>Save Changes</button>
                    </div>

                    {/* Face Recognition Enrollment */}
                    <div className={styles.faceHeaderRow}>
                        <h3 className={styles.cardTitle} style={{ marginTop: 28, marginBottom: 0 }}>
                            Face Recognition Login
                        </h3>
                        <span className={`${styles.cameraStatusBadge} ${cameraLoginEnabled ? styles.cameraStatusOn : styles.cameraStatusOff}`}>
                            {cameraLoginEnabled ? 'Camera Login ON' : 'Camera Login OFF'}
                        </span>
                    </div>
                    <label className={styles.permCheckLabel} style={{ marginBottom: 12 }}>
                        <input
                            type="checkbox"
                            checked={cameraLoginEnabled}
                            onChange={(e) => setCameraLoginEnabled(e.target.checked)}
                            className={styles.permCheckbox}
                            disabled={!isSuperAdmin}
                        />
                        <span className={styles.permCheckText}>
                            Enable camera login
                            {!isSuperAdmin ? ' (super admin only)' : ''}
                        </span>
                    </label>
                    {isSuperAdmin && (
                        <div className={styles.btnRow} style={{ marginTop: 8, marginBottom: 12 }}>
                            <button className={styles.btnPrimary} onClick={handleCameraLoginSave}>
                                Save Camera Login Setting
                            </button>
                        </div>
                    )}
                    {cameraLoginSavedAt && (
                        <p className={styles.permHint} style={{ marginTop: 0, marginBottom: 12 }}>
                            Last saved: {cameraLoginSavedAt}
                        </p>
                    )}
                    <p className={styles.faceDesc}>
                        {!cameraLoginEnabled
                            ? 'Camera login is currently disabled. Admins must use password login.'
                            : faceEnrolled
                            ? 'Your face is enrolled. You can use face recognition to log in as admin.'
                            : 'Enroll your face to enable face recognition login.'}
                    </p>

                    {cameraLoginEnabled && showFaceScanner ? (
                        <div className={styles.faceScannerWrap}>
                            <FaceScanner
                                mode="enroll"
                                captureLabel="Enroll This Face"
                                onCapture={handleFaceEnroll}
                                onError={(msg) => showToast(msg, 'error')}
                                onCancel={() => setShowFaceScanner(false)}
                                pendingRemote={faceLoading}
                            />
                        </div>
                    ) : cameraLoginEnabled ? (
                        <div className={styles.btnRow}>
                            {faceEnrolled ? (
                                <>
                                    <span className={styles.faceStatus}>&#10003; Face Enrolled</span>
                                    <button className={styles.btnPrimary} onClick={() => setShowFaceScanner(true)}>
                                        Re-enroll Face
                                    </button>
                                    <button className={styles.btnDanger} onClick={handleFaceRemove}>
                                        Remove Face
                                    </button>
                                </>
                            ) : (
                                <button className={styles.btnPrimary} onClick={() => setShowFaceScanner(true)} disabled={faceLoading}>
                                    Enroll Face
                                </button>
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            {/* ── TAB: Fees ── */}
            {currentTabKey === 'fees' && (
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Document & Fees Configuration</h3>
                    <table className={styles.feesTable}>
                        <thead>
                            <tr>
                                <th>Document</th>
                                <th>Fee (₱)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fees.map((f, i) => (
                                <tr key={f.name}>
                                    <td>{f.name}</td>
                                    <td>
                                        <input className={styles.feeInput} type="number" min="0" value={f.fee} onChange={(e) => handleFeeChange(i, e.target.value)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className={styles.onlinePaymentToggleRow}>
                        <h3 className={styles.cardTitle} style={{ marginTop: 28, marginBottom: 0 }}>
                            Online Payment
                        </h3>
                        <span className={`${styles.cameraStatusBadge} ${paymentConfig.onlinePaymentEnabled !== false ? styles.cameraStatusOn : styles.cameraStatusOff}`}>
                            {paymentConfig.onlinePaymentEnabled !== false ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <label className={styles.permCheckLabel} style={{ marginTop: 12, marginBottom: 8 }}>
                        <input
                            type="checkbox"
                            checked={paymentConfig.onlinePaymentEnabled !== false}
                            onChange={(e) => setPaymentConfig((prev) => ({
                                ...prev,
                                onlinePaymentEnabled: e.target.checked,
                            }))}
                            className={styles.permCheckbox}
                        />
                        <span className={styles.permCheckText}>
                            Allow residents to pay online (GCash / Bank Transfer)
                        </span>
                    </label>
                    <p className={styles.permHint} style={{ marginTop: 0, marginBottom: 20 }}>
                        When disabled, the payment page shows cash only. You can still save destination details below for when online payment is turned on again.
                    </p>
                    <h3 className={styles.cardTitle}>Online Payment Destination</h3>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>GCash Account Name</label>
                            <input
                                className={styles.formInput}
                                value={paymentConfig.gcash?.accountName || ''}
                                onChange={(e) => setPaymentField('gcash', 'accountName', e.target.value)}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>GCash Number</label>
                            <input
                                className={styles.formInput}
                                value={paymentConfig.gcash?.accountNumber || ''}
                                onChange={(e) => setPaymentField('gcash', 'accountNumber', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>GCash QR Image (recommended)</label>
                        <div className={styles.qrUploadRow}>
                            <label className={styles.qrUploadBtn}>
                                {qrUploading ? 'Uploading...' : 'Upload QR Image'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleGcashQrUpload}
                                    className={styles.qrUploadInput}
                                    disabled={qrUploading}
                                />
                            </label>
                            <span className={styles.qrUploadHint}>
                                {paymentConfig.gcash?.qrImageUrl ? 'QR uploaded' : 'No QR uploaded yet'}
                            </span>
                        </div>
                        {qrPreviewUrl ? (
                            <div className={styles.qrPreviewWrap}>
                                <img src={qrPreviewUrl} alt="GCash QR preview" className={styles.qrPreviewImage} />
                            </div>
                        ) : null}
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Bank Name</label>
                            <input
                                className={styles.formInput}
                                value={paymentConfig.bank?.bankName || ''}
                                onChange={(e) => setPaymentField('bank', 'bankName', e.target.value)}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Bank Account Name</label>
                            <input
                                className={styles.formInput}
                                value={paymentConfig.bank?.accountName || ''}
                                onChange={(e) => setPaymentField('bank', 'accountName', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Bank Account Number</label>
                        <input
                            className={styles.formInput}
                            value={paymentConfig.bank?.accountNumber || ''}
                            onChange={(e) => setPaymentField('bank', 'accountNumber', formatBankAccountNumber(e.target.value))}
                        />
                    </div>
                    <div className={styles.btnRow}>
                        <button className={styles.btnPrimary} onClick={handleFeesSave}>Save Fees & Payment Info</button>
                    </div>
                    {paymentSavedAt && (
                        <p style={{ marginTop: 10, fontSize: '0.8rem', color: '#6b7280' }}>
                            Last saved: {paymentSavedAt}
                        </p>
                    )}
                </div>
            )}

            {/* ── TAB: Request Settings ── */}
            {currentTabKey === 'request-config' && (
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Common Request Purposes</h3>
                    <p className={styles.permHint} style={{ marginTop: 0 }}>
                        Shown as a dropdown on the payment page. Residents can pick a preset or choose &quot;Other&quot; to type their own.
                    </p>
                    <div className={styles.addRow}>
                        <input
                            className={styles.formInput}
                            placeholder="Add purpose…"
                            value={newPurpose}
                            onChange={(e) => setNewPurpose(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addPurpose()}
                        />
                        <button className={styles.btnPrimary} type="button" onClick={addPurpose}>Add</button>
                    </div>
                    {commonPurposes.length === 0 ? (
                        <div className={styles.emptyState}>No common purposes configured</div>
                    ) : (
                        commonPurposes.map((p) => (
                            <div key={p} className={styles.listItem}>
                                <span className={styles.purokName}>{p}</span>
                                <div className={styles.listItemActions}>
                                    <button className={styles.btnDanger} type="button" onClick={() => removePurpose(p)}>Remove</button>
                                </div>
                            </div>
                        ))
                    )}

                    <h3 className={styles.cardTitle} style={{ marginTop: 28 }}>Document Requirements</h3>
                    <p className={styles.permHint} style={{ marginTop: 0 }}>
                        One requirement per line for each certificate. Shown to residents when selecting documents and to admins when validating requests.
                    </p>
                    {fees.map((f) => (
                        <div key={f.name} className={styles.formGroup}>
                            <label className={styles.formLabel}>{f.name}</label>
                            <textarea
                                className={styles.formTextarea}
                                rows={3}
                                value={(documentRequirements[f.name] || []).join('\n')}
                                onChange={(e) => setDocRequirementsText(f.name, e.target.value)}
                                placeholder={'Valid ID\nPurok Clearance'}
                            />
                        </div>
                    ))}

                    <div className={styles.btnRow}>
                        <button className={styles.btnPrimary} type="button" onClick={handleRequestConfigSave}>
                            Save Request Settings
                        </button>
                    </div>
                    {requestConfigSavedAt && (
                        <p className={styles.permHint} style={{ marginTop: 10, marginBottom: 0 }}>
                            Last saved: {requestConfigSavedAt}
                        </p>
                    )}
                </div>
            )}

            {/* ── TAB: Official Receipt (OR) ── */}
            {currentTabKey === 'or-booklet' && (
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Official Receipt (OR) Booklet</h3>
                    <p className={styles.permHint} style={{ marginTop: 0 }}>
                        Enter the OR numbers on the physical booklet the barangay is currently using. Each request
                        marked for release is assigned the next number automatically. When you buy a new booklet from
                        City Hall, update the range here (numbers do not need to follow the previous batch).
                    </p>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Next OR to use</label>
                            <input
                                className={styles.formInput}
                                type="number"
                                min="1"
                                value={orBookletForm.nextOr}
                                onChange={(e) => setOrBookletForm((p) => ({ ...p, nextOr: e.target.value }))}
                                placeholder="e.g. 343"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Last OR in this booklet</label>
                            <input
                                className={styles.formInput}
                                type="number"
                                min="1"
                                value={orBookletForm.endOr}
                                onChange={(e) => setOrBookletForm((p) => ({ ...p, endOr: e.target.value }))}
                                placeholder="e.g. 1000"
                            />
                        </div>
                    </div>
                    {orBookletRemaining != null && (
                        <p className={styles.permHint} style={{ marginTop: 0 }}>
                            {orBookletRemaining} OR number{orBookletRemaining === 1 ? '' : 's'} remaining in this booklet.
                        </p>
                    )}
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Notes (optional)</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={orBookletForm.notes}
                            onChange={(e) => setOrBookletForm((p) => ({ ...p, notes: e.target.value }))}
                            placeholder="e.g. Booklet purchased May 2026"
                        />
                    </div>
                    <div className={styles.btnRow}>
                        <button className={styles.btnPrimary} onClick={handleOrBookletSave}>
                            Save OR Booklet
                        </button>
                    </div>
                    {orBookletSavedAt && (
                        <p className={styles.permHint} style={{ marginTop: 10, marginBottom: 0 }}>
                            Last saved: {orBookletSavedAt}
                        </p>
                    )}
                </div>
            )}

            {/* ── TAB: Request Expiry ── */}
            {currentTabKey === 'request-expiry' && (
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Pending Request Expiry</h3>
                    <p className={styles.permHint} style={{ marginTop: 0 }}>
                        Pending requests older than this number of days are automatically deleted.
                    </p>
                    <div className={styles.formGroup} style={{ maxWidth: 280 }}>
                        <label className={styles.formLabel}>Expiry days</label>
                        <input
                            className={styles.formInput}
                            type="number"
                            min="1"
                            max="365"
                            value={pendingExpiryDays}
                            onChange={(e) => setPendingExpiryDays(e.target.value)}
                        />
                    </div>
                    <div className={styles.btnRow}>
                        <button className={styles.btnPrimary} onClick={handleRequestExpirySave}>
                            Save Expiry Setting
                        </button>
                    </div>
                    {requestExpirySavedAt && (
                        <p className={styles.permHint} style={{ marginTop: 10, marginBottom: 0 }}>
                            Last saved: {requestExpirySavedAt}
                        </p>
                    )}
                </div>
            )}

            {/* ── TAB: Announcements ── */}
            {currentTabKey === 'announcements' && (
                <div className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 className={styles.cardTitle} style={{ margin: 0 }}>Announcements</h3>
                        <button className={styles.btnPrimary} onClick={() => openAnnModal()}>+ Add</button>
                    </div>
                    {announcements.length === 0 ? (
                        <div className={styles.emptyState}>No announcements yet</div>
                    ) : (
                        announcements.map((a) => (
                            <div key={a.id} className={styles.listItem}>
                                <div className={styles.listItemContent}>
                                    <p className={styles.listItemTitle}>{a.title}</p>
                                    <span className={styles.listItemMeta}>{fmtDate(a.date)} — {a.author}</span>
                                    <p className={styles.listItemBody}>{a.content}</p>
                                </div>
                                <div className={styles.listItemActions}>
                                    <button className={styles.btnSmall} onClick={() => openAnnModal(a)}>Edit</button>
                                    <button className={styles.btnDanger} onClick={() => handleAnnDelete(a.id)}>Delete</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ── TAB: Puroks ── */}
            {currentTabKey === 'puroks' && (
                <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Purok List</h3>
                    {puroks.length === 0 ? (
                        <div className={styles.emptyState}>No puroks configured</div>
                    ) : (
                        puroks.map((p, i) => (
                            <div key={i} className={styles.listItem}>
                                {editPurok?.idx === i ? (
                                    <input
                                        className={styles.formInput}
                                        autoFocus
                                        value={editPurok.value}
                                        onChange={(e) => setEditPurok({ idx: i, value: e.target.value })}
                                        onBlur={() => handleRenamePurok(p, editPurok.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleRenamePurok(p, editPurok.value)}
                                        style={{ maxWidth: 240 }}
                                    />
                                ) : (
                                    <span className={styles.purokName}>{p}</span>
                                )}
                                <div className={styles.listItemActions}>
                                    <button className={styles.btnSmall} onClick={() => setEditPurok({ idx: i, value: p })}>Rename</button>
                                    <button className={styles.btnDanger} onClick={() => handleDeletePurok(p)}>Delete</button>
                                </div>
                            </div>
                        ))
                    )}
                    <div className={styles.addRow}>
                        <input
                            className={styles.formInput}
                            placeholder="New purok name…"
                            value={newPurok}
                            onChange={(e) => setNewPurok(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddPurok()}
                        />
                        <button className={styles.btnPrimary} onClick={handleAddPurok}>Add</button>
                    </div>
                </div>
            )}

            {/* ── TAB: Admin Management (super admin only) ── */}
            {currentTabKey === 'admin-management' && isSuperAdmin && (
                <div className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 className={styles.cardTitle} style={{ margin: 0 }}>Admin Accounts</h3>
                        <button className={styles.btnPrimary} onClick={() => openAdminModal()}>+ Add Admin</button>
                    </div>

                    {adminUsers.length === 0 ? (
                        <div className={styles.emptyState}>No admin accounts</div>
                    ) : (
                        <table className={styles.adminTable}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Permissions</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adminUsers.map((a) => (
                                    <tr key={a.id}>
                                        <td>
                                            <div className={styles.adminNameCell}>
                                                {a.name}
                                                {a.superAdmin && <span className={styles.superBadge}>Super Admin</span>}
                                            </div>
                                        </td>
                                        <td>{a.username}</td>
                                        <td>{a.email}</td>
                                        <td>
                                            {a.superAdmin ? (
                                                <span className={styles.permBadge} style={{ background: '#e8f5e9', color: '#2e7d32' }}>Full Access</span>
                                            ) : (
                                                <div className={styles.permList}>
                                                    {(a.permissions || []).length === 0 ? (
                                                        <span className={styles.permBadge} style={{ background: '#fff3e0', color: '#e65100' }}>Profile Only</span>
                                                    ) : (
                                                        (a.permissions || []).map((p) => (
                                                            <span key={p} className={styles.permBadge}>{AVAILABLE_PERMISSIONS.find((ap) => ap.key === p)?.label || p}</span>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {!a.superAdmin && (
                                                <div className={styles.listItemActions}>
                                                    <button className={styles.btnSmall} onClick={() => openAdminModal(a)}>Edit</button>
                                                    <button className={styles.btnDanger} onClick={() => handleAdminDelete(a.id)}>Delete</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── Announcement Modal ── */}
            {annModal !== null && (
                <div className={styles.modalOverlay} onClick={() => setAnnModal(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>{annModal.id ? 'Edit Announcement' : 'New Announcement'}</h3>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Title</label>
                            <input className={styles.formInput} value={annForm.title} onChange={(e) => setAnnForm((p) => ({ ...p, title: e.target.value }))} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Content</label>
                            <textarea className={styles.formTextarea} value={annForm.content} onChange={(e) => setAnnForm((p) => ({ ...p, content: e.target.value }))} />
                        </div>
                        <div className={styles.btnRow}>
                            <button className={styles.btnPrimary} onClick={handleAnnSave}>{annModal.id ? 'Update' : 'Add'}</button>
                            <button className={styles.btnSecondary} onClick={() => setAnnModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Admin Modal ── */}
            {adminModal !== null && (
                <div className={styles.modalOverlay} onClick={() => setAdminModal(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>{adminModal.id ? 'Edit Admin' : 'Add New Admin'}</h3>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Full Name</label>
                                <input className={styles.formInput} value={adminForm.name} onChange={(e) => setAdminForm((p) => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Username</label>
                                <input className={styles.formInput} value={adminForm.username} disabled={!!adminModal.id} style={adminModal.id ? { opacity: 0.6, cursor: 'not-allowed' } : {}} onChange={(e) => setAdminForm((p) => ({ ...p, username: e.target.value }))} />
                            </div>
                        </div>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Email</label>
                                <input className={styles.formInput} type="email" value={adminForm.email} onChange={(e) => setAdminForm((p) => ({ ...p, email: e.target.value }))} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    {adminModal.id ? 'New Password (leave blank to keep)' : 'Initial password'}
                                </label>
                                <input className={styles.formInput} type="password" autoComplete="new-password" value={adminForm.password} onChange={(e) => setAdminForm((p) => ({ ...p, password: e.target.value }))} />
                            </div>
                        </div>

                        {!adminModal.id && (
                            <p className={styles.permHint} style={{ marginTop: 0, marginBottom: 16 }}>
                                Face login is set up by each admin after their first sign-in. Use this field for a temporary or
                                backup password: they log in at /welcome (Use password instead if needed), then open
                                System Settings → Admin Profile → Face Recognition Login to enroll. They should keep this
                                password in case face login is unavailable.
                            </p>
                        )}

                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Permissions</label>
                            <p className={styles.permHint}>Select which sections this admin can access. All admins can always access their own profile.</p>
                            <div className={styles.permGrid}>
                                {AVAILABLE_PERMISSIONS.map((perm) => (
                                    <label key={perm.key} className={styles.permCheckLabel}>
                                        <input
                                            type="checkbox"
                                            checked={adminForm.permissions.includes(perm.key)}
                                            onChange={() => toggleAdminPermission(perm.key)}
                                            className={styles.permCheckbox}
                                        />
                                        <span className={styles.permCheckText}>{perm.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className={styles.btnRow}>
                            <button className={styles.btnPrimary} onClick={handleAdminSave}>{adminModal.id ? 'Update' : 'Add Admin'}</button>
                            <button className={styles.btnSecondary} onClick={() => setAdminModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>{toast.msg}</div>}
        </div>
        </>
    );
}
