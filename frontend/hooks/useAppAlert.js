'use client';

import { useCallback, useRef, useState } from 'react';
import AlertDialog from '@/components/AlertDialog';

/**
 * In-app alerts (replaces window.alert).
 */
export function useAppAlert() {
    const [state, setState] = useState(null);
    const onCloseRef = useRef(null);

    const showAlert = useCallback((title, message, options = {}) => {
        onCloseRef.current = options.onClose;
        setState({
            title: title || 'Notice',
            message: message || '',
            confirmLabel: options.confirmLabel || 'OK',
        });
    }, []);

    const close = useCallback(() => {
        const after = onCloseRef.current;
        onCloseRef.current = null;
        setState(null);
        after?.();
    }, []);

    const alertDialog = (
        <AlertDialog
            open={!!state}
            title={state?.title}
            message={state?.message}
            confirmLabel={state?.confirmLabel}
            onClose={close}
        />
    );

    return { showAlert, alertDialog };
}
