'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './FaceScanner.module.css';

export default function FaceScanner({
    onCapture,
    onError,
    onCancel,
    onUsePassword,
    /** When true (e.g. after several failed face logins), show link centered at bottom of the video frame */
    showUsePasswordHint = false,
    /** Parent is waiting on the server (e.g. enroll-face); keep UI responsive after local capture */
    pendingRemote = false,
    captureLabel = 'Capture Face',
    mode = 'enroll',
}) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const autoTimerRef = useRef(null);

    const [cameraReady, setCameraReady] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [statusMessage, setStatusMessage] = useState('Starting camera...');

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startAutoCapture = () => {
        setCountdown(3);
        let remaining = 3;
        const tick = () => {
            remaining--;
            if (remaining <= 0) {
                setCountdown(null);
                capturePhoto();
            } else {
                setCountdown(remaining);
                autoTimerRef.current = setTimeout(tick, 1000);
            }
        };
        autoTimerRef.current = setTimeout(tick, 1000);
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    setCameraReady(true);
                    if (mode === 'login') {
                        setStatusMessage('Look at the camera');
                        startAutoCapture();
                    } else {
                        setStatusMessage('Position your face and click capture');
                    }
                };
            }
        } catch {
            setStatusMessage('Camera access denied');
            onError?.('Camera access denied. Please allow camera permissions.');
        }
    };

    const stopCamera = () => {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    };

    const capturePhoto = () => {
        if (capturing) return;
        setCapturing(true);
        setStatusMessage('Analyzing face...');

        const video = videoRef.current;
        if (!video || !video.videoWidth) {
            setCapturing(false);
            setStatusMessage('Camera not ready');
            onError?.('Camera not ready. Please try again.');
            return;
        }

        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);

        const base64 = c.toDataURL('image/jpeg', 0.92);
        stopCamera();
        onCapture?.(base64);
        // Always clear — parent handles async; otherwise "Processing…" and Cancel stay stuck
        setCapturing(false);
        if (mode === 'enroll') {
            setStatusMessage('');
        }
    };

    const handleCancel = () => {
        stopCamera();
        onCancel?.();
    };

    const handleUsePassword = () => {
        stopCamera();
        onUsePassword?.();
    };

    const modal = (
        <div className={styles.modalBackdrop}>
            <div className={styles.modal}>
                <h2 className={styles.title}>
                    {mode === 'login' ? 'Position your face within the frame' : 'Look at the camera and click capture'}
                </h2>

                <div className={styles.videoContainer}>
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={styles.video}
                    />

                    {!cameraReady && (
                        <div className={styles.loadingOverlay}>
                            <div className={styles.spinner} />
                            <p>{statusMessage}</p>
                        </div>
                    )}

                    {countdown !== null && (
                        <div className={styles.countdownOverlay}>
                            <span className={styles.countdownNumber}>{countdown}</span>
                        </div>
                    )}

                    {mode === 'login' && showUsePasswordHint && onUsePassword && cameraReady && (
                        <div className={styles.videoPasswordBar}>
                            <button type="button" className={styles.videoPasswordLink} onClick={handleUsePassword}>
                                Use password instead
                            </button>
                        </div>
                    )}
                </div>

                <p className={styles.status}>
                    {pendingRemote && mode === 'enroll'
                        ? 'Saving on server… (first time can take a minute while models load)'
                        : statusMessage}
                </p>

                <div className={styles.actions}>
                    {mode === 'enroll' && (
                        <button
                            className={styles.captureBtn}
                            onClick={capturePhoto}
                            disabled={!cameraReady || capturing || pendingRemote}
                        >
                            {pendingRemote ? 'Please wait…' : capturing ? 'Processing...' : captureLabel}
                        </button>
                    )}
                    {mode === 'login' && cameraReady && !capturing && countdown === null && (
                        <button className={styles.captureBtn} onClick={capturePhoto} disabled={pendingRemote}>
                            Retry
                        </button>
                    )}
                    {capturing && <p className={styles.hint}>Capturing…</p>}
                    {pendingRemote && !capturing && <p className={styles.hint}>Verifying on server…</p>}
                    <button className={styles.cancelBtn} onClick={handleCancel} disabled={capturing}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
