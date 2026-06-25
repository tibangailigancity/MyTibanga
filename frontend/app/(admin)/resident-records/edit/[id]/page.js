'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import styles from '../../add/page.module.css';
import ConfirmDialog from '@/components/ConfirmDialog';
import ResidentCredentialDialog from '@/components/ResidentCredentialDialog';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import { alignChildrenFormArrays } from '@/lib/residentChildren';
import { validateSoloParentSector } from '@/lib/residentValidation';

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

export default function EditResidentPage() {
    const router = useRouter();
    const params = useParams();
    const residentId = params.id;
    const { showAlert, dialogs } = useAppDialogs();
    const showAlertRef = useRef(showAlert);
    showAlertRef.current = showAlert;

    const [form, setForm] = useState(null);
    const [puroks, setPuroks] = useState([]);
    const [households, setHouseholds] = useState([]);
    const [householdMembers, setHouseholdMembers] = useState([]);
    const [religionOption, setReligionOption] = useState('');
    const [religionOther, setReligionOther] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [soloParentDialogOpen, setSoloParentDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const [resettingPortal, setResettingPortal] = useState(false);

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
        fetch(`/api/admin/residents/${residentId}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.resident) {
                    const r = data.resident;
                    const savedReligion = r.religion || '';
                    const knownReligion = RELIGION_OPTIONS.includes(savedReligion) && savedReligion !== 'Others'
                        ? savedReligion
                        : '';
                    const childNames = r.children?.length > 0 ? r.children : (r.childsName ? [r.childsName] : ['']);
                    const { children, childrenAges } = alignChildrenFormArrays(childNames, r.childrenAges);
                    setForm({
                        firstName: r.firstName || '',
                        middleName: r.middleName || '',
                        lastName: r.lastName || '',
                        suffix: r.suffix || '',
                        sex: r.sex || '',
                        civilStatus: r.civilStatus || '',
                        birthdate: r.birthdate || '',
                        birthplace: r.birthplace || '',
                        religion: savedReligion,
                        household: r.household || '',
                        housingStatus: r.housingStatus || '',
                        sector: r.sector || (r.soloParent ? 'Solo parent' : ''),
                        soloParent: r.soloParent === true,
                        citizenship: r.citizenship || '',
                        purok: r.purok || '',
                        barangay: r.barangay || 'Tibanga',
                        city: r.city || 'Iligan City',
                        mobileNumber: r.mobileNumber || '',
                        email: r.email || '',
                        mothersMaidenName: r.mothersMaidenName || '',
                        fathersName: r.fathersName || '',
                        spousesName: r.spousesName || '',
                        motherDeceased: r.motherDeceased === true,
                        fatherDeceased: r.fatherDeceased === true,
                        spouseDeceased: r.spouseDeceased === true,
                        children,
                        childrenAges,
                        username: r.username || '',
                        password: '',
                    });
                    if (knownReligion) {
                        setReligionOption(knownReligion);
                        setReligionOther('');
                    } else if (savedReligion) {
                        setReligionOption('Others');
                        setReligionOther(savedReligion);
                    }
                    setHouseholdMembers(data.householdMembers || []);
                }
                setLoading(false);
            })
            .catch(() => {
                showAlertRef.current('Could not load resident', 'Failed to load resident data.');
                setLoading(false);
            });
    }, [residentId]);

    const handleChange = (field, value) => {
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === 'mothersMaidenName' && !String(value).trim()) next.motherDeceased = false;
            if (field === 'fathersName' && !String(value).trim()) next.fatherDeceased = false;
            if (field === 'spousesName' && !String(value).trim()) next.spouseDeceased = false;
            return next;
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

    const resetPortalPassword = async () => {
        if (!residentId || resettingPortal) return;
        setResettingPortal(true);
        try {
            const res = await fetch(`/api/admin/residents/${residentId}/reset-portal-password`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showAlert('Cannot reset password', data.error || 'Failed to reset portal password.');
                return;
            }
            setCredentialDialog({
                title: 'New portal password issued',
                residentName: data.residentName || `${form.firstName} ${form.lastName}`.trim(),
                username: data.username,
                tempPassword: data.tempPassword,
                smsSent: data.smsSent,
                smsReason: data.smsReason || '',
            });
        } catch {
            showAlert('Cannot reset password', 'Failed to reset portal password.');
        } finally {
            setResettingPortal(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const soloErr = validateSoloParentSector(form.sector, form.children);
        if (soloErr) {
            setSoloParentDialogOpen(true);
            return;
        }
        setIsSubmitting(true);

        try {
            const payload = { ...form };
            delete payload.password;
            const res = await fetch(`/api/admin/residents/${residentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (data.success) {
                showAlert('Resident updated', 'Changes were saved successfully.', {
                    onClose: () => router.push('/resident-records'),
                });
            } else {
                showAlert('Cannot save resident', data.error || 'Failed to update');
            }
        } catch (err) {
            showAlert('Cannot save resident', err.message || 'Error updating resident');
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

    if (loading) {
        return <div className={styles.page}><p style={{ color: '#666', textAlign: 'center', marginTop: 60 }}>Loading resident data...</p></div>;
    }

    if (!form) {
        return <div className={styles.page}><p style={{ color: '#c62828', textAlign: 'center', marginTop: 60 }}>Resident not found.</p></div>;
    }

    return (
        <>
            {dialogs}
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
                    <Link href="/resident-records" className={styles.backBtn}>←</Link>
                    <div>
                        <h1 className={styles.pageTitle}>Edit Resident</h1>
                        <p className={styles.pageSubtitle}>Editing: {form.firstName} {form.lastName} — as of {today}</p>
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
                            type={form.birthdate ? 'date' : 'text'}
                            placeholder="Date of Birth (mm/dd/yyyy)"
                            className={styles.input}
                            value={form.birthdate}
                            onFocus={(e) => { e.target.type = 'date'; }}
                            onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                            onChange={(e) => handleChange('birthdate', e.target.value)}
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

                {form.household && (
                    <fieldset className={styles.formSection}>
                        <legend className={styles.sectionTitle}>Household Members</legend>
                        {householdMembers.length === 0 ? (
                            <p className={styles.credentialsNote}>No other members found in this household yet.</p>
                        ) : (
                            householdMembers.map((m) => (
                                <div key={m.id} className={styles.formRow}>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={`${m.firstName} ${m.lastName}`}
                                        readOnly
                                    />
                                </div>
                            ))
                        )}
                    </fieldset>
                )}

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

                {/* Portal account */}
                <fieldset className={styles.formSection}>
                    <legend className={styles.sectionTitle}>Portal account</legend>
                    <div className={styles.formRowTwo}>
                        <div className={styles.credentialField}>
                            <label className={styles.credentialLabel}>Username</label>
                            <input type="text" className={`${styles.input} ${styles.credentialInput}`}
                                value={form.username}
                                onChange={(e) => handleChange('username', e.target.value)} />
                        </div>
                        <div className={styles.credentialField}>
                            <label className={styles.credentialLabel}>Password</label>
                            <p className={styles.credentialsNote}>
                                Passwords are sent by SMS. Use Reset portal password to send a new one.
                            </p>
                            <button
                                type="button"
                                className={styles.portalResetBtn}
                                disabled={resettingPortal || !form.username?.trim()}
                                onClick={resetPortalPassword}
                            >
                                {resettingPortal ? 'Issuing…' : 'Reset portal password'}
                            </button>
                        </div>
                    </div>
                </fieldset>

                {/* Submit */}
                <div className={styles.formActions}>
                    <button type="submit" className={styles.confirmBtn} disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
        </>
    );
}
