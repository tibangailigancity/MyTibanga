'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import TimeDisplay from '@/components/TimeDisplay';
import { formatChildrenWithAges, formatNameWithDeceased } from '@/lib/residentChildren';
import styles from './page.module.css';

export default function ProfilePage() {
    const router = useRouter();
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [resident, setResident] = useState(null);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [editing, setEditing] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    // Profile picture
    const [picturePreview, setPicturePreview] = useState(null);
    const [showPictureOptions, setShowPictureOptions] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const fileInputRef = useRef(null);

    // Editable fields
    const [email, setEmail] = useState('');
    const [mobileNumber, setMobileNumber] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [notification, setNotification] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/profile')
            .then((res) => res.json())
            .then((data) => {
                if (data.user) {
                    setProfile(data.user);
                    setEmail(data.user.email || '');
                    const forced = data.user.mustChangePassword === true;
                    setMustChangePassword(forced);
                    if (forced) {
                        setChangingPassword(true);
                    }
                }
                if (data.resident) {
                    setResident(data.resident);
                    setMobileNumber(data.resident.mobileNumber || '');
                    if (data.resident.idPicture) {
                        setPicturePreview(data.resident.idPicture);
                    }
                }
            })
            .catch(() => { });
    }, []);

    const forcedPasswordChange = mustChangePassword;

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    };

    // ==================== PICTURE HANDLERS ====================
    const handleUploadClick = () => {
        fileInputRef.current?.click();
        setShowPictureOptions(false);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                setPicturePreview(dataUrl);
                savePicture(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    const startCamera = useCallback(async () => {
        setShowPictureOptions(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 400, height: 300 },
            });
            streamRef.current = stream;
            setCameraActive(true);
        } catch {
            showNotification('Could not access camera. Please allow camera permission.', 'error');
        }
    }, []);

    useEffect(() => {
        if (cameraActive && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [cameraActive]);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setCameraActive(false);
    }, []);

    const capturePhoto = useCallback(() => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setPicturePreview(dataUrl);
            savePicture(dataUrl);
            stopCamera();
        }
    }, [stopCamera]);

    const savePicture = async (dataUrl) => {
        try {
            const res = await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idPicture: dataUrl }),
            });
            const data = await res.json();
            if (data.success) {
                showNotification('Profile picture updated!', 'success');
            }
        } catch {
            showNotification('Failed to update picture', 'error');
        }
    };

    // ==================== SAVE HANDLERS ====================
    const handleSaveInfo = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, mobileNumber }),
            });
            const data = await res.json();
            if (data.success) {
                showNotification('Profile updated successfully!', 'success');
                setEditing(false);
            } else {
                showNotification(data.error || 'Update failed', 'error');
            }
        } catch {
            showNotification('Failed to update profile', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword) {
            showNotification('Please enter your current password', 'error');
            return;
        }
        if (!newPassword) {
            showNotification('Please enter a new password', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showNotification('New passwords do not match', 'error');
            return;
        }
        if (newPassword.trim().length < 6) {
            showNotification('New password must be at least 6 characters', 'error');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (data.success) {
                showNotification('Password changed successfully!', 'success');
                setChangingPassword(false);
                setMustChangePassword(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                if (forcedPasswordChange) {
                    setTimeout(() => router.push('/document-request'), 1200);
                }
            } else {
                showNotification(data.error || 'Password change failed', 'error');
            }
        } catch {
            showNotification('Failed to change password', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!profile) {
        return (
            <>
                <TimeDisplay />
                <div className={styles.loadingContainer}>Loading profile...</div>
            </>
        );
    }

    return (
        <>
            <TimeDisplay />

            <div className={styles.profileContainer}>
                <h1 className={styles.pageTitle}>My Profile</h1>

                {forcedPasswordChange && (
                    <div className={styles.forcedBanner}>
                        For your security, please set a new password before using the portal.
                    </div>
                )}

                {/* Profile Header Card */}
                <div className={styles.profileCard}>
                    <div className={styles.profileHeader}>
                        <div className={styles.avatarWrapper}>
                            {picturePreview ? (
                                <img src={picturePreview} alt="Profile" className={styles.avatarImage} />
                            ) : (
                                <div className={styles.avatar}>
                                    {getInitials(profile.name)}
                                </div>
                            )}
                            <button
                                className={styles.avatarEditBtn}
                                onClick={() => setShowPictureOptions(!showPictureOptions)}
                                title="Change profile picture"
                                disabled={forcedPasswordChange}
                                style={forcedPasswordChange ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            >
                                ✎
                            </button>

                            {showPictureOptions && (
                                <div className={styles.pictureDropdown}>
                                    <button className={styles.pictureOption} onClick={handleUploadClick}>
                                        Upload Photo
                                    </button>
                                    <button className={styles.pictureOption} onClick={startCamera}>
                                        Take Photo
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className={styles.profileInfo}>
                            <h2 className={styles.profileName}>{profile.name}</h2>
                            <p className={styles.profileRole}>{profile.role === 'admin' ? 'Administrator' : 'Resident'}</p>
                            <p className={styles.profileUsername}>@{profile.username}</p>
                        </div>
                    </div>

                    {/* Camera Modal */}
                    {cameraActive && (
                        <div className={styles.cameraSection}>
                            <video ref={videoRef} autoPlay playsInline className={styles.cameraVideo} />
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                            <div className={styles.cameraControls}>
                                <button className={styles.captureBtn} onClick={capturePhoto}>📸 Capture</button>
                                <button className={styles.cancelCameraBtn} onClick={stopCamera}>Cancel</button>
                            </div>
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />
                </div>

                {/* Personal Information Card */}
                <div className={styles.infoCard}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Personal Information</h3>
                        {!forcedPasswordChange && (
                            !editing ? (
                                <button className={styles.editBtn} onClick={() => setEditing(true)}>Edit</button>
                            ) : (
                                <div className={styles.editActions}>
                                    <button className={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
                                    <button className={styles.saveBtn} onClick={handleSaveInfo} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            )
                        )}
                    </div>

                    <div className={styles.infoGrid}>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>First Name</span>
                            <span className={styles.infoValue}>
                                {resident?.firstName || profile.name?.split(' ')[0] || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Middle Name</span>
                            <span className={styles.infoValue}>
                                {resident?.middleName || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Last Name</span>
                            <span className={styles.infoValue}>
                                {resident?.lastName || profile.name?.split(' ').slice(-1)[0] || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Suffix</span>
                            <span className={styles.infoValue}>
                                {resident?.suffix || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Sex</span>
                            <span className={styles.infoValue}>
                                {resident?.sex || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Civil Status</span>
                            <span className={styles.infoValue}>
                                {resident?.civilStatus || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Birthdate</span>
                            <span className={styles.infoValue}>
                                {resident?.birthdate || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Birthplace</span>
                            <span className={styles.infoValue}>
                                {resident?.birthplace || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Religion</span>
                            <span className={styles.infoValue}>
                                {resident?.religion || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Citizenship</span>
                            <span className={styles.infoValue}>
                                {resident?.citizenship || '—'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Solo parent</span>
                            <span className={styles.infoValue}>
                                {resident?.soloParent ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Email Address</span>
                            {editing ? (
                                <input
                                    type="email"
                                    className={styles.editInput}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter email"
                                />
                            ) : (
                                <span className={styles.infoValue}>{email || '—'}</span>
                            )}
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Mobile number / landline</span>
                            {editing ? (
                                <input
                                    type="tel"
                                    className={styles.editInput}
                                    value={mobileNumber}
                                    onChange={(e) => setMobileNumber(e.target.value)}
                                    placeholder="Mobile number / Landline"
                                    aria-label="Mobile number or landline"
                                />
                            ) : (
                                <span className={styles.infoValue}>{mobileNumber || '—'}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Address Card */}
                <div className={styles.infoCard}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Address</h3>
                    </div>
                    <div className={styles.infoGrid}>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Purok</span>
                            <span className={styles.infoValue}>{resident?.purok || '—'}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Barangay</span>
                            <span className={styles.infoValue}>{resident?.barangay || '—'}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>City</span>
                            <span className={styles.infoValue}>{resident?.city || '—'}</span>
                        </div>
                    </div>
                </div>

                {/* Family Information Card */}
                <div className={styles.infoCard}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Family Information</h3>
                    </div>
                    <div className={styles.infoGrid}>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Mother&apos;s Maiden Name</span>
                            <span className={styles.infoValue}>
                                {formatNameWithDeceased(resident?.mothersMaidenName, resident?.motherDeceased)}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Father&apos;s Name</span>
                            <span className={styles.infoValue}>
                                {formatNameWithDeceased(resident?.fathersName, resident?.fatherDeceased)}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Spouse&apos;s Name</span>
                            <span className={styles.infoValue}>
                                {formatNameWithDeceased(resident?.spousesName, resident?.spouseDeceased)}
                            </span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Children</span>
                            <span className={styles.infoValue}>
                                {formatChildrenWithAges(resident?.children, resident?.childrenAges) || '—'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Password Card */}
                <div className={styles.infoCard}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Password</h3>
                        {!forcedPasswordChange && (
                            !changingPassword ? (
                                <button className={styles.editBtn} onClick={() => setChangingPassword(true)}>
                                    Change Password
                                </button>
                            ) : (
                                <div className={styles.editActions}>
                                    <button className={styles.cancelBtn} onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>
                                        Cancel
                                    </button>
                                    <button className={styles.saveBtn} onClick={handleChangePassword} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            )
                        )}
                        {forcedPasswordChange && changingPassword && (
                            <button className={styles.saveBtn} onClick={handleChangePassword} disabled={saving}>
                                {saving ? 'Saving...' : 'Save new password'}
                            </button>
                        )}
                    </div>

                    {changingPassword ? (
                        <div className={styles.passwordGrid}>
                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Current Password</span>
                                <input
                                    type="password"
                                    className={styles.editInput}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Enter current password"
                                />
                            </div>
                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>New Password</span>
                                <input
                                    type="password"
                                    className={styles.editInput}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter new password"
                                />
                            </div>
                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Confirm New Password</span>
                                <input
                                    type="password"
                                    className={styles.editInput}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.infoGrid}>
                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Password</span>
                                <span className={styles.infoValue}>••••••••</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Notification */}
            {notification && (
                <div className={`${styles.toast} ${styles[notification.type]}`}>
                    {notification.message}
                </div>
            )}
        </>
    );
}
