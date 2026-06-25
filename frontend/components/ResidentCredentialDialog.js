'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import dialogStyles from './ConfirmDialog.module.css';
import styles from './ResidentCredentialDialog.module.css';
import { formatResidentAccountSmsNote } from '@/lib/residentWelcomeSms';

export default function ResidentCredentialDialog({
    open,
    title = 'Portal login credentials',
    residentName,
    username,
    tempPassword,
    smsSent,
    smsReason,
    accountCreated = true,
    onAddAnother,
    onDone,
    showAddAnother = false,
}) {
    const [mounted, setMounted] = useState(false);
    const [copyState, setCopyState] = useState('');
    const titleId = useId();
    const descId = useId();

    const smsNote = formatResidentAccountSmsNote({ smsSent, smsReason, accountCreated });
    const showPasswordOnScreen = !smsSent && tempPassword;

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) {
            setCopyState('');
            return;
        }
        const onKey = (e) => {
            if (e.key === 'Escape') onDone?.();
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onDone]);

    const credentialText = [
        'MyTibangaPortal login',
        residentName ? `Name: ${residentName}` : '',
        `Username: ${username || ''}`,
        showPasswordOnScreen ? `PIN: ${tempPassword}` : 'PIN: sent by SMS',
        'Change password on first login.',
    ]
        .filter(Boolean)
        .join('\n');

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(credentialText);
            setCopyState('Copied to clipboard');
        } catch {
            setCopyState('Copy failed');
        }
    };

    if (!mounted || !open) return null;

    return createPortal(
        <div className={dialogStyles.backdrop} role="presentation" onClick={() => onDone?.()}>
            <div
                className={`${dialogStyles.dialog} ${styles.dialogWide}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className={dialogStyles.title}>
                    {title}
                </h2>
                {residentName ? <p className={styles.subtitle}>{residentName}</p> : null}
                <div id={descId} className={styles.credentialBlock}>
                    <div className={styles.credentialRow}>
                        <span className={styles.credentialLabel}>Username</span>
                        <span className={styles.credentialValue}>{username || '—'}</span>
                    </div>
                    {showPasswordOnScreen ? (
                        <div className={styles.credentialRow}>
                            <span className={styles.credentialLabel}>6-digit PIN</span>
                            <span className={styles.credentialValue}>{tempPassword}</span>
                        </div>
                    ) : (
                        <div className={styles.credentialRow}>
                            <span className={styles.credentialLabel}>PIN</span>
                            <span className={styles.credentialValue}>Sent to resident&apos;s mobile</span>
                        </div>
                    )}
                </div>
                <p className={styles.note}>{smsNote}</p>
                <p className={styles.note}>
                    Residents sign in with username <strong>firstname.lastname</strong> and the PIN from SMS.
                    If they forget the PIN, use Reset portal password on their record to send a new one.
                </p>
                <div className={styles.actionsStack}>
                    {showPasswordOnScreen ? (
                        <button type="button" className={dialogStyles.btnConfirmNeutral} onClick={handleCopy}>
                            Copy credentials
                        </button>
                    ) : null}
                    {copyState ? <p className={styles.copyHint}>{copyState}</p> : null}
                    {showAddAnother ? (
                        <button type="button" className={dialogStyles.btnCancel} onClick={() => onAddAnother?.()}>
                            Add another resident
                        </button>
                    ) : null}
                    <button type="button" className={dialogStyles.btnConfirm} onClick={() => onDone?.()}>
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
