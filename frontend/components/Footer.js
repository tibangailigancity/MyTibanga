import styles from './Footer.module.css';

export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className={styles.footer}>
            <div className={styles.footerContainer}>
                <p className={styles.copyright}>
                    Copyright © {year} MyTibangaPortal. All rights reserved.
                </p>
            </div>
        </footer>
    );
}
