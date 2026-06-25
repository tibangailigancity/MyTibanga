'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import { validateSoloParentSector } from '@/lib/residentValidation';
import { formatResidentAccountSmsNote } from '@/lib/residentWelcomeSms';
import { generateResidentUsername } from '@/lib/residentUsername';
import ResidentCredentialDialog from '@/components/ResidentCredentialDialog';

const EMPTY_FORM = {
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    sex: '',
    civilStatus: '',
    birthdate: '',
    birthplace: '',
    religion: '',
    household: '',
    housingStatus: '',
    sector: '',
    soloParent: false,
    citizenship: '',
    purok: '',
    barangay: 'Tibanga',
    city: 'Iligan City',
    mobileNumber: '',
    email: '',
    mothersMaidenName: '',
    fathersName: '',
    spousesName: '',
    motherDeceased: false,
    fatherDeceased: false,
    spouseDeceased: false,
    children: [''],
    childrenAges: [''],
    username: '',
    idPicture: null,
};

const RELIGION_OPTIONS = [
    'Roman Catholic',
    'Islam',
    'Iglesia ni Cristo',
    'Protestant',
    'Aglipayan',
    'Others',
];

const SECTOR_OPTIONS = [
    'Solo parent',
    'Seniors',
    'PWD',
    'LGBTQ',
    'ERPAT',
    'Fisherfolks',
    'Trisikad Association',
];

export default function AddResidentPage() {
    const router = useRouter();
    const { showAlert, dialogs } = useAppDialogs();
    const [form, setForm] = useState(EMPTY_FORM);

    const [puroks, setPuroks] = useState([]);
    const [households, setHouseholds] = useState([]);
    const [religionOption, setReligionOption] = useState('');
    const [religionOther, setReligionOther] = useState('');
    const [idPreview, setIdPreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [soloParentDialogOpen, setSoloParentDialogOpen] = useState(false);
    const [residentCount, setResidentCount] = useState(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.puroks) setPuroks(d.puroks); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetch('/api/admin/households')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.households) setHouseholds(d.households); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetch('/api/admin/residents', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : { residents: [] }))
            .then((d) => setResidentCount(Array.isArray(d.residents) ? d.residents.length : 0))
            .catch(() => setResidentCount(0));
    }, []);

    const handleChange = (field, value) => {
        setForm((prev) => {
            const updated = { ...prev, [field]: value };
            if (field === 'mothersMaidenName' && !String(value).trim()) updated.motherDeceased = false;
            if (field === 'fathersName' && !String(value).trim()) updated.fatherDeceased = false;
            if (field === 'spousesName' && !String(value).trim()) updated.spouseDeceased = false;
            if (['firstName', 'lastName'].includes(field)) {
                updated.username = generateResidentUsername({
                    firstName: field === 'firstName' ? value : prev.firstName,
                    lastName: field === 'lastName' ? value : prev.lastName,
                });
            }
            return updated;
        });
    };

    const handleReligionSelect = (value) => {
        setReligionOption(value);
        if (value === 'Others') {
            handleChange('religion', religionOther);
        } else {
            setReligionOther('');
            handleChange('religion', value);
        }
    };

    const handleReligionOtherChange = (value) => {
        setReligionOther(value);
        handleChange('religion', value);
    };

    const handleChildChange = (index, value) => {
        setForm((prev) => {
            const children = [...prev.children];
            children[index] = value;
            return { ...prev, children };
        });
    };

    const handleChildAgeChange = (index, value) => {
        setForm((prev) => {
            const childrenAges = [...(prev.childrenAges || [])];
            while (childrenAges.length < prev.children.length) childrenAges.push('');
            childrenAges[index] = value;
            return { ...prev, childrenAges };
        });
    };

    const addChild = () => {
        setForm((prev) => {
            const ages = [...(prev.childrenAges || [])];
            while (ages.length < prev.children.length) ages.push('');
            ages.push('');
            return { ...prev, children: [...prev.children, ''], childrenAges: ages };
        });
    };

    const removeChild = (index) => {
        setForm((prev) => ({
            ...prev,
            children: prev.children.filter((_, i) => i !== index),
            childrenAges: (prev.childrenAges || []).filter((_, i) => i !== index),
        }));
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleChange('idPicture', file);
            const reader = new FileReader();
            reader.onload = (ev) => setIdPreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        handleChange('idPicture', null);
        setIdPreview(null);
    };

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 400, height: 300 } });
            streamRef.current = stream;
            setCameraActive(true);
        } catch (err) {
            showAlert(
                'Camera unavailable',
                'Could not access camera. Please allow camera permission or use the upload option.'
            );
        }
    }, []);

    // Connect stream to video element after it renders
    useEffect(() => {
        if (cameraActive && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [cameraActive]);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
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
            setIdPreview(dataUrl);
            handleChange('idPicture', dataUrl);
            stopCamera();
        }
    }, [stopCamera]);

    const resetForm = useCallback(() => {
        stopCamera();
        setForm(EMPTY_FORM);
        setReligionOption('');
        setReligionOther('');
        setIdPreview(null);
    }, [stopCamera]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const soloErr = validateSoloParentSector(form.sector, form.children);
        if (soloErr) {
            setSoloParentDialogOpen(true);
            return;
        }
        setIsSubmitting(true);

        try {
            const res = await fetch('/api/admin/residents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            const data = await res.json();

            if (data.success) {
                const username = data.account?.username || data.resident?.username || '—';
                const smsNote = formatResidentAccountSmsNote({
                    smsSent: data.account?.smsSent,
                    smsReason: data.account?.smsReason,
                    accountCreated: data.account?.accountCreated,
                });
                const residentName = `${data.resident?.firstName || form.firstName} ${data.resident?.lastName || form.lastName}`.trim();
                if (data.account?.accountCreated && data.account?.tempPassword) {
                    setCredentialDialog({
                        residentName,
                        username,
                        tempPassword: data.account.tempPassword,
                        smsSent: data.account?.smsSent,
                        smsReason: data.account?.smsReason,
                    });
                } else {
                    showAlert(
                        'Resident added successfully',
                        `Username: ${username}\n\n${smsNote}`,
                        { onClose: () => router.push('/resident-records') }
                    );
                }
            } else {
                showAlert('Cannot save resident', data.message || 'Failed to save');
            }
        } catch (err) {
            showAlert('Cannot save resident', err.message || 'Error saving resident');
        } finally {
            setIsSubmitting(false);
        }
    };

    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

    const calculateAge = (birthdate) => {
        if (!birthdate) return '';
        const birth = new Date(birthdate);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const monthDiff = now.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    return (
        <>
            {dialogs}
            <ResidentCredentialDialog
                open={!!credentialDialog}
                title="Resident added successfully"
                residentName={credentialDialog?.residentName}
                username={credentialDialog?.username}
                tempPassword={credentialDialog?.tempPassword}
                smsSent={credentialDialog?.smsSent}
                smsReason={credentialDialog?.smsReason}
                showAddAnother
                onAddAnother={() => {
                    setCredentialDialog(null);
                    resetForm();
                }}
                onDone={() => {
                    setCredentialDialog(null);
                    router.push('/resident-records');
                }}
            />
            <ConfirmDialog
                open={soloParentDialogOpen}
                title="Cannot save resident"
                message="Solo parent sector requires at least one child name."
                confirmLabel="OK"
                cancelLabel={null}
                confirmVariant="primary"
                onConfirm={() => setSoloParentDialogOpen(false)}
                onCancel={() => setSoloParentDialogOpen(false)}
            />
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div className={styles.headerInfo}>
                    <Link href="/resident-records" className={styles.backBtn}>←</Link>
                    <div>
                        <h1 className={styles.pageTitle}>Adding New Resident</h1>
                        <p className={styles.pageSubtitle}>
                            Total Resident: {residentCount === null ? '…' : residentCount} as of {today}
                        </p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <form
                className={styles.formCard}
                onSubmit={handleSubmit}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
            >

                {/* Resident's Information */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>Resident&apos;s Information</legend>

                    <div className={styles.formRow}>
                        <input type="text" placeholder="First Name *" className={styles.input}
                            value={form.firstName} onChange={(e) => handleChange('firstName', e.target.value)} required />
                    </div>
                    <div className={styles.formRow}>
                        <input type="text" placeholder="Middle Name" className={styles.input}
                            value={form.middleName} onChange={(e) => handleChange('middleName', e.target.value)} />
                    </div>
                    <div className={styles.formRow}>
                        <input type="text" placeholder="Last Name *" className={styles.input}
                            value={form.lastName} onChange={(e) => handleChange('lastName', e.target.value)} required />
                    </div>
                    <div className={styles.formRowThree}>
                        <input type="text" placeholder="Suffix" className={styles.input}
                            value={form.suffix} onChange={(e) => handleChange('suffix', e.target.value)} />
                        <select className={styles.select} value={form.sex}
                            onChange={(e) => handleChange('sex', e.target.value)} required>
                            <option value="">Sex *</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                        <select className={styles.select} value={form.civilStatus}
                            onChange={(e) => handleChange('civilStatus', e.target.value)} required>
                            <option value="">Civil Status *</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Widowed">Widowed</option>
                            <option value="Divorced">Divorced</option>
                        </select>
                    </div>
                    <div className={styles.formRowThree}>
                        <input
                            type="date"
                            className={styles.input}
                            value={form.birthdate}
                            onChange={(e) => handleChange('birthdate', e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            aria-label="Date of Birth *"
                            title="Date of Birth *"
                            required
                        />
                        <input type="text" placeholder="Age" className={styles.input}
                            value={calculateAge(form.birthdate)} readOnly />
                        <input type="text" placeholder="Birthplace" className={styles.input}
                            value={form.birthplace} onChange={(e) => handleChange('birthplace', e.target.value)} />
                    </div>
                    <div className={styles.formRowTwo}>
                        <select
                            className={`${styles.select} ${!religionOption ? styles.selectPlaceholder : ''}`}
                            value={religionOption}
                            onChange={(e) => handleReligionSelect(e.target.value)}>
                            <option value="">Religion</option>
                            {RELIGION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <input type="text" placeholder="Citizenship" className={styles.input}
                            value={form.citizenship} onChange={(e) => handleChange('citizenship', e.target.value)} />
                    </div>
                    <div className={styles.formRow}>
                        <select className={styles.select} value={form.housingStatus}
                            onChange={(e) => handleChange('housingStatus', e.target.value)}>
                            <option value="">Housing Status</option>
                            <option value="Home Owner">Home Owner</option>
                            <option value="Renter">Renter</option>
                            <option value="Dependent / Lives with Family">Dependent / Lives with Family</option>
                        </select>
                    </div>
                    <div className={styles.formRow}>
                        <input
                            type="text"
                            list="household-options"
                            placeholder="Household (e.g., Dela Cruz Family)"
                            className={styles.input}
                            value={form.household}
                            onChange={(e) => handleChange('household', e.target.value)}
                        />
                        <datalist id="household-options">
                            {households.map((h) => (
                                <option key={h.name} value={h.name} />
                            ))}
                        </datalist>
                    </div>
                    <div className={styles.formRow}>
                        <select
                            className={`${styles.select} ${!form.sector ? styles.selectPlaceholder : ''}`}
                            value={form.sector}
                            onChange={(e) => handleChange('sector', e.target.value)}
                        >
                            <option value="">Sector / Association</option>
                            {SECTOR_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    {religionOption === 'Others' && (
                        <div className={styles.formRow}>
                            <input
                                type="text"
                                placeholder="Please specify religion"
                                className={styles.input}
                                value={religionOther}
                                onChange={(e) => handleReligionOtherChange(e.target.value)}
                            />
                        </div>
                    )}
                </fieldset>

                {/* Address */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>Address</legend>
                    <div className={styles.formRowThree}>
                        <select className={styles.select} value={form.purok}
                            onChange={(e) => handleChange('purok', e.target.value)} required>
                            <option value="">Purok *</option>
                            {puroks.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        <input type="text" placeholder="Barangay" className={styles.input}
                            value={form.barangay} onChange={(e) => handleChange('barangay', e.target.value)} />
                        <input type="text" placeholder="City" className={styles.input}
                            value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
                    </div>
                </fieldset>

                {/* Contact Information */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>Contact Information</legend>
                    <div className={styles.formRow}>
                        <input
                            type="tel"
                            placeholder="Mobile number / Landline"
                            className={styles.input}
                            value={form.mobileNumber}
                            onChange={(e) => handleChange('mobileNumber', e.target.value)}
                            aria-label="Mobile number or landline"
                        />
                    </div>
                    <div className={styles.formRow}>
                        <input type="email" placeholder="Email" className={styles.input}
                            value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
                    </div>
                </fieldset>

                {/* Other Information */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>Other Information</legend>
                    <div className={styles.familyFieldRow}>
                        <input type="text" placeholder="Mother's Maiden Name" className={styles.input}
                            value={form.mothersMaidenName} onChange={(e) => handleChange('mothersMaidenName', e.target.value)} />
                        {form.mothersMaidenName?.trim() && (
                            <label className={styles.deceasedLabel}>
                                <input
                                    type="checkbox"
                                    checked={form.motherDeceased}
                                    onChange={(e) => handleChange('motherDeceased', e.target.checked)}
                                />
                                Deceased
                            </label>
                        )}
                    </div>
                    <div className={styles.familyFieldRow}>
                        <input type="text" placeholder="Father's Name" className={styles.input}
                            value={form.fathersName} onChange={(e) => handleChange('fathersName', e.target.value)} />
                        {form.fathersName?.trim() && (
                            <label className={styles.deceasedLabel}>
                                <input
                                    type="checkbox"
                                    checked={form.fatherDeceased}
                                    onChange={(e) => handleChange('fatherDeceased', e.target.checked)}
                                />
                                Deceased
                            </label>
                        )}
                    </div>
                    <div className={styles.familyFieldRow}>
                        <input type="text" placeholder="Spouse's Name" className={styles.input}
                            value={form.spousesName} onChange={(e) => handleChange('spousesName', e.target.value)} />
                        {form.spousesName?.trim() && (
                            <label className={styles.deceasedLabel}>
                                <input
                                    type="checkbox"
                                    checked={form.spouseDeceased}
                                    onChange={(e) => handleChange('spouseDeceased', e.target.checked)}
                                />
                                Deceased
                            </label>
                        )}
                    </div>

                    {/* Dynamic Children Fields */}
                    {form.children.map((child, i) => (
                        <div key={i} className={styles.childRow}>
                            <input type="text" placeholder="Child's Name" className={styles.input}
                                value={child} onChange={(e) => handleChildChange(i, e.target.value)} />
                            <input
                                type="number"
                                min={0}
                                max={120}
                                inputMode="numeric"
                                placeholder="Age"
                                className={styles.childAgeInput}
                                value={(form.childrenAges && form.childrenAges[i]) ?? ''}
                                onChange={(e) => handleChildAgeChange(i, e.target.value)}
                                aria-label={`Child ${i + 1} age`}
                            />
                            {form.children.length > 1 && (
                                <button type="button" className={styles.removeChildBtn} onClick={() => removeChild(i)}>×</button>
                            )}
                        </div>
                    ))}
                    <button type="button" className={styles.addChildBtn} onClick={addChild}>
                        + Add another child
                    </button>
                </fieldset>

                {/* Account Credentials */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>Account Credentials</legend>
                    <p className={styles.credentialsNote}>
                        Username is auto-generated as firstname.lastname. A 6-digit PIN is sent
                        by SMS to the resident&apos;s mobile — not the username.
                    </p>
                    <div className={styles.formRowTwo}>
                        <div className={styles.credentialField}>
                            <label className={styles.credentialLabel}>Username</label>
                            <input type="text" className={`${styles.input} ${styles.credentialInput}`}
                                value={form.username}
                                onChange={(e) => handleChange('username', e.target.value)}
                                placeholder="firstname.lastname" readOnly />
                        </div>
                    </div>
                    <p className={styles.credentialsHint}>⚠ Resident must change password on first login.</p>
                </fieldset>

                {/* ID Picture */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>ID Picture</legend>
                    <div className={styles.uploadArea}>
                        {idPreview ? (
                            <div className={styles.uploadedImage}>
                                <img src={idPreview} alt="ID Preview" />
                                <button type="button" className={styles.removeImageBtn} onClick={removeImage}>×</button>
                            </div>
                        ) : cameraActive ? (
                            <div className={styles.cameraContainer}>
                                <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
                                <canvas ref={canvasRef} style={{ display: 'none' }} />
                                <div className={styles.cameraControls}>
                                    <button type="button" className={styles.captureBtn} onClick={capturePhoto}>📸 Capture</button>
                                    <button type="button" className={styles.cancelCameraBtn} onClick={stopCamera}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.pictureOptions}>
                                <button type="button" className={styles.takePictureBtn} onClick={startCamera}>
                                    <span className={styles.cameraIcon}>📷</span>
                                    <span>Take a Picture</span>
                                </button>
                                <span className={styles.orDivider}>or</span>
                                <label className={styles.uploadLabelAlt}>
                                    <input type="file" accept="image/*" className={styles.fileInput}
                                        onChange={handleImageUpload} />
                                    <span>Upload from device</span>
                                </label>
                            </div>
                        )}
                    </div>
                </fieldset>

                {/* Submit */}
                <div className={styles.formActions}>
                    <button type="submit" className={styles.confirmBtn} disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Confirm'}
                    </button>
                </div>
            </form>
        </div>
        </>
    );
}
