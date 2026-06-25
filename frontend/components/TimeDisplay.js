'use client';

import { useState, useEffect } from 'react';
import styles from './TimeDisplay.module.css';

function formatPhilippineTime(date) {
    const options = {
        timeZone: 'Asia/Manila',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);

    const get = (type) => parts.find((p) => p.type === type)?.value || '';

    return `${get('weekday')} | ${get('month')} ${get('day')}, ${get('year')} | ${get('hour')}:${get('minute')}:${get('second')} ${get('dayPeriod')}`;
}

export default function TimeDisplay() {
    const [time, setTime] = useState(null);
    const [isoTime, setIsoTime] = useState('');

    useEffect(() => {
        function tick() {
            const now = new Date();
            setTime(formatPhilippineTime(now));
            setIsoTime(now.toISOString());
        }

        tick(); // Set initial time on client only
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className={styles.timeDisplay}>
            <div className={styles.timeLabel}>Philippine Standard Time:</div>
            <time className={styles.timeValue} dateTime={isoTime || undefined}>
                {time ?? 'Loading...'}
            </time>
        </div>
    );
}
