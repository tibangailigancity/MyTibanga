'use client';

import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * Single-button alert (replaces window.alert for branded UX).
 */
export default function AlertDialog({
    open,
    title = 'Notice',
    message,
    confirmLabel = 'OK',
    onClose,
}) {
    return (
        <ConfirmDialog
            open={open}
            title={title}
            message={message}
            confirmLabel={confirmLabel}
            cancelLabel={null}
            confirmVariant="primary"
            onConfirm={() => onClose?.()}
            onCancel={() => onClose?.()}
        />
    );
}
