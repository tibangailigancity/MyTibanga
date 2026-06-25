'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmDialog.module.css';

/**
 * In-app prompt with text input (replaces window.prompt for branded UX).
 */
export default function PromptDialog({
    open,
    title = 'Input required',
    message,
    value = '',
    onChange,
    matchText,
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
    const inputId = useId();

    const matchRequired = matchText != null && String(matchText).length > 0;
    const canConfirm = !matchRequired || value === matchText;

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onCancel?.();
            if (e.key === 'Enter' && canConfirm) onConfirm?.();
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onCancel, onConfirm, canConfirm]);

    useEffect(() => {
        if (!open || !mounted) return;
        const t = setTimeout(() => {
            document.getElementById(inputId)?.focus();
        }, 50);
        return () => clearTimeout(t);
    }, [open, mounted, inputId]);

    if (!mounted || !open) return null;

    return createPortal(
        <div className={styles.backdrop} role="presentation" onClick={() => onCancel?.()}>
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
                {message ? (
                    <p id={descId} className={styles.message}>
                        {message}
                    </p>
                ) : null}
                <input
                    id={inputId}
                    type="text"
                    className={styles.input}
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                />
                {matchRequired ? (
                    <p className={styles.inputHint}>Type {matchText} to enable confirm.</p>
                ) : null}
                <div className={styles.actions}>
                    {cancelLabel ? (
                        <button type="button" className={styles.btnCancel} onClick={() => onCancel?.()}>
                            {cancelLabel}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={confirmClass}
                        disabled={!canConfirm}
                        onClick={() => onConfirm?.()}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
