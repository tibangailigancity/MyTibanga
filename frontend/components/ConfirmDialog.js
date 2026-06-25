'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmDialog.module.css';

/**
 * Centered in-app confirmation (replaces window.confirm for branded UX).
 */
export default function ConfirmDialog({
    open,
    title = 'Confirm',
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    confirmVariant = 'primary',
    onConfirm,
    onCancel,
}) {
    const confirmClass =
        confirmVariant === 'danger'
            ? styles.btnConfirmDanger
            : confirmVariant === 'neutral'
              ? styles.btnConfirmNeutral
              : styles.btnConfirm;
    const [mounted, setMounted] = useState(false);
    const titleId = useId();
    const descId = useId();

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onCancel?.();
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onCancel]);

    if (!mounted || !open) return null;

    return createPortal(
        <div
            className={styles.backdrop}
            role="presentation"
            onClick={() => onCancel?.()}
        >
            <div
                className={styles.dialog}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className={styles.title}>
                    {title}
                </h2>
                <p id={descId} className={styles.message}>
                    {message}
                </p>
                <div className={styles.actions}>
                    {cancelLabel ? (
                        <button type="button" className={styles.btnCancel} onClick={() => onCancel?.()}>
                            {cancelLabel}
                        </button>
                    ) : null}
                    <button type="button" className={confirmClass} onClick={() => onConfirm?.()}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
