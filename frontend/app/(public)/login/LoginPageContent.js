'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import TimeDisplay from '@/components/TimeDisplay';
import styles from './page.module.css';

const FaceScanner = dynamic(() => import('@/components/FaceScanner'), { ssr: false });

/** After this many failed face-login attempts, show “Use password instead” inside the scanner frame */
const FACE_HINT_AFTER_FAILURES = 2;

/**
 * @param {'resident' | 'admin'} variant
 *   resident — public /login (password only, residents only)
 *   admin — hidden /welcome (face + password, admins only)
 */
export default function LoginPageContent({ variant = 'resident' }) {
    const isAdminPortal = variant === 'admin';
    const router = useRouter();

    const [loginMode, setLoginMode] = useState(isAdminPortal ? 'choose' : 'password');

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [usernameError, setUsernameError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [faceSubmitting, setFaceSubmitting] = useState(false);
    const [faceScannerKey, setFaceScannerKey] = useState(0);
    const [faceLoginFailCount, setFaceLoginFailCount] = useState(0);
    const [cameraLoginEnabled, setCameraLoginEnabled] = useState(true);
    const [notification, setNotification] = useState(null);

    useEffect(() => {
        const loadCameraLoginConfig = async () => {
            try {
                const res = await fetch('/api/auth/camera-login-config');
                if (!res.ok) return;
                const data = await res.json();
                setCameraLoginEnabled(data.cameraLoginEnabled !== false);
            } catch {
                setCameraLoginEnabled(true);
            }
        };
        loadCameraLoginConfig();
    }, []);

    useEffect(() => {
        if (!cameraLoginEnabled && loginMode === 'admin-face') {
            setLoginMode('password');
        }
    }, [cameraLoginEnabled, loginMode]);

    const validateUsername = (value) => {
        if (!value) return 'Username is required';
        return '';
    };

    const validatePassword = (value) => {
        if (!value) return 'Password is required';
        return '';
    };

    const showNotification = (message, type) => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const usernameErr = validateUsername(username);
        const passwordErr = validatePassword(password);
        setUsernameError(usernameErr);
        setPasswordError(passwordErr);

        if (usernameErr || passwordErr) return;

        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    adminPortal: isAdminPortal,
                }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                showNotification('Login successful! Redirecting...', 'success');
                let redirectTo = '/document-request';
                if (data.user?.mustChangePassword) {
                    redirectTo = '/profile?mustChangePassword=1';
                } else if (data.user?.role === 'admin') {
                    redirectTo = '/admin-dashboard';
                }
                setTimeout(() => router.push(redirectTo), 1500);
            } else {
                throw new Error(data.message || 'Invalid username or password');
            }
        } catch (error) {
            showNotification(error.message, 'error');
            setPassword('');
            setPasswordError('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFaceCapture = async (image) => {
        setFaceSubmitting(true);
        try {
            const res = await fetch('/api/auth/face-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                showNotification('Face recognized! Redirecting...', 'success');
                router.push('/admin-dashboard');
                return;
            }
            const message = data.message || 'Face not recognized';
            showNotification(message, 'error');
            if (/No admin faces enrolled/i.test(message)) {
                setLoginMode('password');
                setFaceLoginFailCount(0);
                return;
            }
            setFaceLoginFailCount((c) => c + 1);
            setFaceScannerKey((k) => k + 1);
        } catch {
            showNotification('Face login failed. Please try again.', 'error');
            setFaceLoginFailCount((c) => c + 1);
            setFaceScannerKey((k) => k + 1);
        } finally {
            setFaceSubmitting(false);
        }
    };

    const handleFaceError = (message) => {
        showNotification(message, 'error');
    };

    const handleForgotPassword = (e) => {
        e.preventDefault();
        showNotification(
            isAdminPortal
                ? 'Contact the super admin or system administrator for password reset assistance.'
                : 'Please contact the Barangay Office for password reset assistance.',
            'info'
        );
    };

    const passwordTitle = isAdminPortal ? 'Admin Login' : 'Log In To Your Account';

    return (
        <>
            <TimeDisplay />

            <section className={styles.loginSection}>
                <div className={styles.loginContainer}>
                    <div className={styles.loginCard}>

                        {isAdminPortal && loginMode === 'choose' && (
                            <>
                                <h2 className={styles.loginTitle}>Admin Portal</h2>
                                <div className={styles.roleSelection}>
                                    <button
                                        className={styles.roleBtn}
                                        onClick={() => {
                                            if (!cameraLoginEnabled) {
                                                showNotification('Camera login is disabled. Redirecting to password login.', 'info');
                                                setLoginMode('password');
                                                return;
                                            }
                                            setFaceLoginFailCount(0);
                                            setLoginMode('admin-face');
                                        }}
                                    >
                                        <span className={styles.roleIcon}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 3H5a2 2 0 0 0-2 2v4" />
                                                <path d="M15 3h4a2 2 0 0 1 2 2v4" />
                                                <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
                                                <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
                                                <circle cx="12" cy="10" r="3" />
                                                <path d="M7 17c0-2.5 2.2-4 5-4s5 1.5 5 4" />
                                            </svg>
                                        </span>
                                        <span className={styles.roleName}>Face Recognition</span>
                                        <span className={styles.roleDesc}>
                                            {cameraLoginEnabled ? 'Camera login' : 'Face login disabled'}
                                        </span>
                                    </button>

                                    <button
                                        className={styles.roleBtn}
                                        onClick={() => setLoginMode('password')}
                                    >
                                        <span className={styles.roleIcon}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 15v2" />
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                            </svg>
                                        </span>
                                        <span className={styles.roleName}>Password</span>
                                        <span className={styles.roleDesc}>Username &amp; Password</span>
                                    </button>
                                </div>
                            </>
                        )}

                        {isAdminPortal && loginMode === 'admin-face' && (
                            <>
                                <h2 className={styles.loginTitle}>Admin Face Recognition</h2>
                                <FaceScanner
                                    key={faceScannerKey}
                                    mode="login"
                                    onCapture={handleFaceCapture}
                                    onError={handleFaceError}
                                    onCancel={() => setLoginMode('choose')}
                                    pendingRemote={faceSubmitting}
                                    showUsePasswordHint={faceLoginFailCount >= FACE_HINT_AFTER_FAILURES}
                                    onUsePassword={() => {
                                        setFaceLoginFailCount(0);
                                        setLoginMode('password');
                                    }}
                                />
                            </>
                        )}

                        {loginMode === 'password' && (
                            <>
                                <h2 className={styles.loginTitle}>{passwordTitle}</h2>

                                <form className={styles.loginForm} onSubmit={handleSubmit} suppressHydrationWarning>
                                    <div className={styles.formGroup}>
                                        <input
                                            type="text"
                                            id="username"
                                            placeholder="Username"
                                            className={`${styles.formInput} ${usernameError ? styles.error : username ? styles.success : ''}`}
                                            value={username}
                                            onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
                                            onBlur={() => setUsernameError(validateUsername(username))}
                                            required
                                        />
                                        {usernameError && <div className={styles.errorMessage}>{usernameError}</div>}
                                    </div>

                                    <div className={styles.formGroup}>
                                        <input
                                            type="password"
                                            id="password"
                                            placeholder="Enter Password"
                                            className={`${styles.formInput} ${passwordError ? styles.error : password ? styles.success : ''}`}
                                            value={password}
                                            onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                            onBlur={() => setPasswordError(validatePassword(password))}
                                            required
                                        />
                                        {passwordError && <div className={styles.errorMessage}>{passwordError}</div>}
                                    </div>

                                    <div className={styles.forgotPassword}>
                                        <a href="#" className={styles.forgotLink} onClick={handleForgotPassword}>
                                            Forgot your password?
                                        </a>
                                    </div>

                                    <button type="submit" className={styles.loginSubmitBtn} disabled={isLoading}>
                                        {isLoading ? 'LOGGING IN...' : 'LOGIN'}
                                    </button>

                                    {!isAdminPortal && (
                                        <div className={styles.registerPrompt}>
                                            <p className={styles.registerText}>Don&apos;t have an account?</p>
                                            <p className={styles.registerLink}>
                                                Go to our Barangay Office to have yourself registered
                                            </p>
                                        </div>
                                    )}
                                </form>

                                {isAdminPortal && (
                                    <div className={styles.switchMode}>
                                        <button
                                            className={styles.switchBtn}
                                            onClick={() => setLoginMode('choose')}
                                        >
                                            &larr; Back to admin login options
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </section>

            <div className={styles.backgroundElements}>
                <div className={`${styles.bgCircle} ${styles.bgCircle1}`}></div>
                <div className={`${styles.bgCircle} ${styles.bgCircle2}`}></div>
                <div className={`${styles.bgCircle} ${styles.bgCircle3}`}></div>
            </div>

            {(isLoading || faceSubmitting) && (
                <div className={`${styles.loadingOverlay} ${styles.show}`}>
                    <div className={styles.loadingSpinner}></div>
                    <p className={styles.loadingText}>
                        {faceSubmitting ? 'Verifying face…' : 'Logging in...'}
                    </p>
                </div>
            )}

            {notification && (
                <div className={`${styles.notification} ${styles[`notification${notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}`]} ${styles.notificationShow}`}>
                    <div className={styles.notificationContent}>
                        <span className={styles.notificationMessage}>{notification.message}</span>
                        <button className={styles.notificationClose} onClick={() => setNotification(null)}>
                            &times;
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
