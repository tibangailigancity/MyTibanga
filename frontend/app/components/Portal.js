'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Portal({ children, onClose }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape' && onClose) {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        if (mounted && onClose) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [mounted, onClose, handleKeyDown]);

    if (!mounted) return null;

    return createPortal(children, document.body);
}
