'use client';

import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import PromptDialog from '@/components/PromptDialog';
import { useAppAlert } from '@/hooks/useAppAlert';

/**
 * Branded in-app dialogs — replaces window.alert, confirm, and prompt.
 */
export function useAppDialogs() {
    const { showAlert, alertDialog } = useAppAlert();
    const [confirmState, setConfirmState] = useState(null);
    const [promptState, setPromptState] = useState(null);
    const confirmResolveRef = useRef(null);
    const promptResolveRef = useRef(null);

    const confirm = useCallback((options = {}) => {
        return new Promise((resolve) => {
            confirmResolveRef.current = resolve;
            setConfirmState({
                title: options.title || 'Confirm',
                message: options.message || '',
                confirmLabel: options.confirmLabel || 'OK',
                cancelLabel: options.cancelLabel !== undefined ? options.cancelLabel : 'Cancel',
                confirmVariant: options.confirmVariant || 'primary',
            });
        });
    }, []);

    const closeConfirm = useCallback((result) => {
        confirmResolveRef.current?.(result);
        confirmResolveRef.current = null;
        setConfirmState(null);
    }, []);

    const promptValueRef = useRef('');

    const prompt = useCallback((options = {}) => {
        return new Promise((resolve) => {
            promptResolveRef.current = resolve;
            promptValueRef.current = '';
            setPromptState({
                title: options.title || 'Input required',
                message: options.message || '',
                value: '',
                matchText: options.matchText,
                confirmLabel: options.confirmLabel || 'OK',
                cancelLabel: options.cancelLabel !== undefined ? options.cancelLabel : 'Cancel',
                confirmVariant: options.confirmVariant || 'primary',
            });
        });
    }, []);

    const closePrompt = useCallback((result) => {
        promptResolveRef.current?.(result);
        promptResolveRef.current = null;
        promptValueRef.current = '';
        setPromptState(null);
    }, []);

    const setPromptValue = useCallback((value) => {
        promptValueRef.current = value;
        setPromptState((prev) => (prev ? { ...prev, value } : prev));
    }, []);

    const dialogs = (
        <>
            {alertDialog}
            <ConfirmDialog
                open={!!confirmState}
                title={confirmState?.title}
                message={confirmState?.message}
                confirmLabel={confirmState?.confirmLabel}
                cancelLabel={confirmState?.cancelLabel}
                confirmVariant={confirmState?.confirmVariant}
                onConfirm={() => closeConfirm(true)}
                onCancel={() => closeConfirm(false)}
            />
            <PromptDialog
                open={!!promptState}
                title={promptState?.title}
                message={promptState?.message}
                value={promptState?.value ?? ''}
                matchText={promptState?.matchText}
                confirmLabel={promptState?.confirmLabel}
                cancelLabel={promptState?.cancelLabel}
                confirmVariant={promptState?.confirmVariant}
                onChange={setPromptValue}
                onConfirm={() => closePrompt(promptValueRef.current)}
                onCancel={() => closePrompt(null)}
            />
        </>
    );

    return { showAlert, confirm, prompt, dialogs };
}
