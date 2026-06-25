'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import styles from './TibangaMap.module.css';

const PUROK_PATHS = {
    'Purok 1': {
        d: 'M1010.59,1859.26l14.39,4.8c-2.46,10.91-5.05,19.64-8.7,29.29l-14.83,39.15,93.36,6.03c9.57.62,18.65,1.71,29.07,2.97l13.72-57.97,108.89,17.47c37.66-76.71,69.6-152.73,100.22-231.09l-157.03-58.39c-13.16-4.89-24.32-10.94-35.63-18.59l-36.27-29.2-27.67,36.79c-9.66,12.85-20.2,22.83-34.13,31.81.14,18.99,10.17,33.33.2,51.77l-16.82.54-14.73,27.04,10.46,26.23-40.86,64.71c13.36,4.74,21.94,9.03,29.67,19.74l-19,23.67c-.99,3.58,2.29,12.12,5.69,13.26Z',
        labelX: 1143, labelY: 1756,
    },
    'Purok 2': {
        d: 'M1016.76,1711.01l10.57,26.01-40.32,63.67-81.93,9.17-43.62-113.15c9.54-4.9,13.56-12.69,17.79-21.48,25.07-52.05,13.13-59.54,29.81-109.02-1.13-15.72,1.81-30.85,9.35-44.99l33.29-62.39,136.79,88.62,22.3,13.73-27.81,37.07c-9.19,12.25-19.8,21.43-33.27,29.61-3.03,18.61,7.22,29.75,2.69,49.31l-17.01.34-18.64,33.49Z',
        labelX: 933, labelY: 1641,
    },
    'Purok 3': {
        d: 'M635.4,1886.15c-30.32-11.76-49.91-26.83-67.42-53.54-9.58-14.61-21.35-25.67-36.34-34.53l-105.4-62.28c-5.31-3.72-10.14-8.29-13.27-13.89l-26.3-47,59.92-52.2c10.06-8.76,18.73-17.56,28.18-27.76l74.44,29.35c32.35,12.76,33.07,29.2,76.89,47.67l52.13,21.97c11.66,4.91,21.93,8.65,35.07,13.14-3.45,12.1-8.29,23.97-13.7,36.03l-64.19,143.05Z',
        labelX: 517, labelY: 1719,
    },
    'Purok 4': {
        d: 'M758.36,1647.14c-4.56,6.09-6.61,9.54-12.31,11.29-12.16,3.74-26.03,11.34-30.02,23.93-.5,2.33,3.58,7.7,2.53,9.76s-4.67,6.38-7.17,6.94c-8.81-2.99-20.27-7.36-29.02-11.03l-51.06-21.4c-46.4-19.45-46.67-35.83-76.9-47.79l-74.78-29.59,14.07-22.22,93.37-185.48c12.79-25.4,22.09-50.94,31.94-78.07l96.18,45.35,156.39,71.09c25.72,10.38,49.63,21.49,73.79,35.45l-33.21,62.75c-7.76,14.67-11.08,30.53-10.07,46.79-16.46,48.93-4.75,58.03-29.98,108.83-3.11,6.27-6.61,13.22-13.18,16.1l-82.99-23.64-2-10.27-15.59-8.79Z',
        labelX: 680, labelY: 1529,
    },
    'Purok 5': {
        d: 'M451.77,1527.83l34.69,37.48c-10.39,18.88-24.32,34.41-40.56,48.58l-62.58,54.6-92.67-163.56c-10.48-18.49-23.86-30.6-43.5-38.14-15.73-6.04-30.35-14.54-45.79-22.61l43.75-95.16c7.04,5.48,11.06,10.96,15.8,17.47,11.77,16.18,27.25,28.71,44.22,39.59l54.37,34.85c6.17,3.95,13.33,8.2,16.4,14.94,7.68,16.89,19.7,28.13,35.64,37.48,5.93,9.8,9.36,21.32,13.66,33.78l26.58.7Z',
        labelX: 319, labelY: 1516,
    },
    'Purok 6': {
        d: 'M416.08,1488.68c-35.3-22.71-22.96-27.53-46.22-50.22,22.58-26.52,40.32-59.81,51.55-92.97,2.62-7.72-.04-17.52.28-26.46l20.46-16.65c5.66-4.61,11.08-11.52,13.06-18.56l13.05-46.49c49.57,20.53,96.66,39.85,144.45,62.93-12.05,34.2-24.76,65.19-40.77,96.75l-81.97,161.66-34.73-37.53-24.9-1.01c-4.45-10.86-6.74-23.85-14.28-31.45Z',
        labelX: 452, labelY: 1391,
    },
    'Purok 7': {
        d: 'M414.88,1342.52c-9.49,29.4-30.64,71.35-52.08,92.32l-49.61-31.86c-16.58-10.64-32.61-21.98-44.51-37.9-6.43-8.59-12.34-16.23-20.71-23.82l64.04-131.67c5.36-11.03,10.93-20.63,18.38-29.56l131.12,54.49-13.95,50.22c-1.78,6.41-9.82,12.12-14.75,16.45-6.51,4.73-13.32,9.84-18.19,15.46-.98,8.12,2.76,18.12.26,25.86Z',
        labelX: 306, labelY: 1307,
    },
    'Purok 8': {
        d: 'M379.39,1111.38l22.81-27.05c9.33-11.07,17.12-22.76,28.16-32.35,17.33-15.07,34.51-29.55,53.71-42.3,10.85-7.21,22.88-11.04,34.85-17.52l.28-41.25c16.64-15.44,30.68-26.14,54.1-18.77l59.32-56.55.57-20,16.71,6.83c4.19,6.78,10.38,10.12,16.23,14.6l66.52,50.93c14.49,11.1,29.02,21.23,42.81,33.65l-159.36,332.33-100.45-44.56-180.36-74.92c17.91-22.95,47.65-29.19,44.12-63.08Z',
        labelX: 542, labelY: 1083,
    },
    'Purok 9': {
        d: 'M1058.95,1121.84l-142.82,309.89-203.62-91.88-90.2-42.77,158.88-331.28c21.32,15.29,43.22,24.54,65.2,36.93l153.95,86.76,48.06,20.67c4.53.98,10.48,5.54,10.56,11.68Z',
        labelX: 798, labelY: 1207,
    },
    'Purok 10': {
        d: 'M1451.54,1382.85c-11.01,38.2-21.54,74.21-34.2,111.08-12.28,35.75-26.13,69.27-40.71,103.95l-27.51,65.43-171.8-64.84c-17.52-6.61-30.85-20.98-44.89-32.47-7.67-6.28-15.36-8.89-23.51-14.17l-125.31-81.09c-20.05-12.97-39.24-24.37-61.14-35.89l145.12-314.88,112.8,53.15c.11,5.49-1.51,10.87-4,15.67l-33.05,64.97c-6.91,13.59-10.54,28.18-15.45,43.99,25.36.38,47.28,3.31,70.48,10.57,27.68,8.67,54.35,16.54,82.67,23.23,32.46,7.67,62.12,19.19,93.95,28.62l76.56,22.69Z',
        labelX: 1145, labelY: 1436,
    },
    'Purok 11A': {
        d: 'M1376.03,1353.17c-30.02-8.87-56.86-19.52-86.59-26.72-28.83-6.92-56.15-14.45-84.31-23.39-22.03-7-43.16-11.32-67.5-11.98,5.09-18.78,12.26-36.29,21.26-53.64l26.81-51.67c22.78,4.06,42.19-3.27,61-15.49l102.26-66.44c21.11,6.46,38.06,26.48,57.85,30.78,26.37,5.72,50.81,13.03,76.15,21.76,12.86,4.43,25.65,8.2,34.94,19.16-9.34,16.16-16.38,32.55-21.7,51.12l-42.79,149.38-77.39-22.87Z',
        labelX: 1318, labelY: 1235,
    },
    'Purok 11B': {
        d: 'M1242.31,1164.73c-17.33,11.26-34.47,18.13-54.42,13.97l.06-9.94-114.73-54.01c5.84-4.3,7.38-8.68,8.95-15.25,12.54-52.64,28.79-103.64,48.67-153.95,5.97-15.11,10.25-28.66,10.15-45.09l-.49-80.17c-22.57-3.92-37.18,1.27-60.9-2.71-1.25-25.76-3.15-49.32-2.74-75.32.11-6.85,5.22-16.69,7.15-23.88l25.92-96.73c6.86-25.61,13.59-50.85,13.5-77.51l-.17-45.5,156.86,37.96-2.81,43.05c-1.06,16.24-10.68,26.52-14.49,40.98l-31.38,119.16c-2.04,7.73-7.92,14.48-13.69,19.77l-39.55,36.27c-8.42,7.72-16.21,18.77-18.55,30.01-3.99,19.21-6.24,37.45-9.06,56.7-3.42,23.32-5.82,45.66-6.38,68.93,15.7,13.98,31.75,23.96,50.3,32.46l59.19,27.11c34.58,15.84,56.73,49.04,72.86,83.11l13.57,7.01-97.83,63.6Z',
        labelX: 1121, labelY: 682,
    },
    'Purok 12': {
        d: 'M1075.81,1095.96c-1.62,6.81-1.88,10.37-7.67,12.57-4.46,1.69-6.97-.03-12.23-2.31l-44.78-19.45-152.84-85.55-43.2-22.8c-15.79-8.33-29.58-17.53-43.97-29.57,12.23-37.48,25.53-72.47,39.53-108.83,6.78-17.62,13.41-34.57,23.67-50.25,6.69-10.22,13.18-19.78,18.05-31.1,9.67-22.5,19.38-44.6,30.22-66.5l63.9,17.27,122.43,32.07,3.73,80.42c6.97,2.62,14.34,3.71,22.01,4.18l38.68-.22c.93,31.29,1.62,59.4-.51,89.53-.72,10.19-5.68,19.41-9.42,29.17-18.94,49.47-35.13,98.96-47.61,151.37Z',
        labelX: 922, labelY: 898,
    },
    'Purok 13': {
        d: 'M765.45,942.93c-35.11-24.35-68.52-50.93-102.26-77.95-2.56-2.05-5.82-3.72-7.97-5.96-11.08-11.5-.63,4.78-15.59-13.08,11.61-5.23,18.85-14.3,23.58-25.47,6.05-14.26,12.57-27.13,19.89-41.62l-19.93-71.2c17.28-22.39,37.79-52.31,20.04-78.39-2.31-3.39-3.93-7.64-4.72-11.63,44.36,26.74,66.77,16.73,116.12,19.65,13.98.83,25.62,8.94,30.03,21.79,3.24,9.43,9.87,16.66,19.34,19.98l31.47,11.03-29.01,64.62c-5.19,11.57-11.31,21.94-18.77,32.11-9.29,15.32-16.09,31.04-22.55,47.99l-39.69,108.11Z',
        labelX: 719, labelY: 741,
    },
    'Purok 14': {
        d: 'M842.89,671.07c-4.28-1.51-9.27-7.84-10.81-12.39-5.72-16.92-20.26-28.11-38.68-28.43l-61.53-1.08c-18.74-.33-34.52-9.57-50.88-17.91-5.4-2.75-9.33-6.19-11.49-11.22-5.75-13.36,12.53-26.21,21.26-34.69,6.93-6.73,10.28-16.91,14.54-25.8,13.75-28.66,26-56.66,37.98-86.19l30.5-75.21,4.39-11.14-44.02-22.1,23.37-42.62,39.95,23.79-7.11,44.03c7.92,3.88,14.86,6.43,22.98,8.38l8.96-16.5,57.09,7.67c24.48,3.29,47.68-.07,69.63-11.3l22.02-11.27c-.71,36.95-8.11,71.25-16.37,107.27l-24.79,108.2c-2.92,12.74-6.59,24.77-12.01,36.53l-39.06,84.66-35.93-12.68Z',
        labelX: 782, labelY: 520,
    },
    'Purok 15': {
        d: 'M1118.03,483.4c-4.25,39.5,2.35,60.94-6.55,101.44l-103.56-17.36-4.47,42.22c-26.49-.07-52.84-3.78-77.05-12.15,7.1-20.6,12.05-39.15,16.54-59.25l21.16-94.79c10.95,4.54,21.24,7.19,32.71,7.16,22.27-.05,42.92,3.43,64.29,9.09l50.73,13.44c3.9,1.03,6.62,6.27,6.19,10.2Z',
        labelX: 987, labelY: 520,
    },
    'Purok 16': {
        d: 'M1071.93,735.06l-186.07-48.95,37.57-81.78c27.97,8.55,55.88,13.12,86.22,12.18l4.52-40.82,96.1,16.3-15.43,58.05-22.9,85.01Z',
        labelX: 964, labelY: 655,
    },
    'Purok 17': {
        d: 'M1659.5,968.66l-44.4-36.98c-14.94-12.44-31.66-20.36-52.22-22.4l4.03-89.39,3.02-62.68,10.01-77.86,43.89-80.92,45.26,23.87c25.27,19.26,51.77,34.78,80.22,48.88,10.31,5.21,20.51,9.34,30.44,15.38l102.14,62.18-90.56,78.22c-22.31,19.27-40.49,40.55-59.88,62.71-25.58,24.76-48.59,48.82-71.93,78.99Z',
        labelX: 1650, labelY: 772,
    },
    'MSU-IIT': {
        d: 'M1373.71,1108.31c-13.34-8.3-27.01-12.83-41.44-18.72-17.17-34.97-40.61-69.03-76.64-85.5l-58.91-26.93c-16.9-7.72-31.67-16.78-45.62-29.08,1.16-21.31,2.68-40.52,5.89-60.92l9.39-59.59c1.81-11.48,10.94-21.6,19.33-29.3l40.24-36.92c7.09-6.51,10.87-14.71,13.47-24.01,10.71-38.25,17.22-77.09,30.2-114.45,5.16-14.85,13.55-26.23,14.68-42.99l3.3-48.8-155.29-37.41,9.07-29.96-74.7-18.99c18.6-19.91,35.21-38.56,50.41-59.89,10.32-14.49,27.49-18.59,44.98-15.19,9.33.63,21.75,4.19,29.54-3.2,18.23-17.3,33.94-36.58,48.44-57.08,12.92-18.27,16.29-40.85,24.58-49.38,17.48-17.97,35.09-33.88,53.67-50.75l39.25,10.76,13.16,85.16c.54,6.66,5.69,16.77,2.52,22.96l-36.3,71.01,85.84,18.56c27.46,5.94,53.66,9.97,82.7,12.72l-71.68,78.96,14.04,12.01-8.85,72.86c-2.54,20.91-6.17,40.44-5.96,61.68l139.55,30.64-9.67,73.12c-1.14,8.65-1.34,17.48-1.86,26.57l-5.49,128.83c21.89,1.82,39.84,8.9,55.7,22.31l43.52,36.78-79.23,102.57c-21.97,28.44-40.65,57.29-53.85,91.88-10.18-9.56-21.8-13.97-34.49-18.32-26.64-9.13-52.47-16.68-79.97-22.94-12.52-2.85-22.31-12.14-33.5-19.1Z',
        labelX: 1357, labelY: 856,
    },
    'NCS': {
        d: 'M994.13,1931.38c-79.7-5.38-49.7-10.38-124.99,14.17l-62.23-39.88-.69-32.09-36.21,6.3,2.19,26.12-46.87,24.96-83.87-41,65.6-146.22c6.75-15.05,11.23-29.62,15.85-44.8,1.79-5.87,4.97-9.99.47-16.72,10.8-17.97,27.17-13.58,36.81-25,1.06.08,3.79.74,5.1,1.25,1.57.62,2.61,4.89,2.63,7.22-.03,1.57,1.24,5.94,3.47,6.57l81.83,23.19,47.41,122.07,76.23-8.8c14.31-1.65,27.6,3.2,38.05,13.58l-18.09,22.12,5.13,19.65,15.15,4.72c-3.52,11.09-7.13,21.58-11.4,32.63l-11.58,29.95Z',
        labelX: 741, labelY: 1854,
    },
};

// Additional decorative paths (campus outline, etc.) that aren't puroks
const CAMPUS_PATH = 'M1316.72,201.43l-58.04,54.26c-13.46,20.26-10.91,31.81-26.34,52.63-14.09,19-28.36,37.31-46.09,53.29-10.47,9.43-50.08-14.68-74.21,18.53-15.93,21.93-34.21,42.86-53.14,62.35-.98,1.01-2.1,3.59-2.27,4.74-.17,1.15,2.7,3.02,4.31,3.42l71.32,17.95-6.42,20.34c-1.32-8.79-.51-18.94-9.93-21.51l-49.13-13.42c-22.63-6.18-44.29-10.3-67.89-10.24-11.26.03-22.21-2.13-32.63-7.45,7.37-31.38,10.17-61.45,12.8-93.2l43.94-20.03c10.44-4.76,18.09-11.59,25.98-20.11,40.5-43.71,79.71-87.34,113.21-136.93l62.36-92.32c11.83,4.13,20.77,13.58,23.51,26.25l16.09,74.49,74.09-3.38c26.96,21.85,34.86,28.14,51.85,59.33,18.81,34.54,33.81,69.96,49.66,106.18,18.03,4.04,34.42-.84,50.2-8.92,11.16-5.71,22.11-9.1,34.56-13.73l4.49,20.06c-45.72,21.83-43.9,19.87-90.62,27.54-1.28.21-3.99,1.58-4.84,2.4s.54,3.9,1.31,4.97l35.39,50.06c-18.15-2.44-33.3-5.34-50.04-8.98l-72.97-15.86,32.86-64.23c3.62-7.09-1.43-17.57-2.38-24.95l-14.12-90.37-46.88-13.18Z';
const CAMPUS_PATH_2 = 'M1445.63,597.43l8.74-70.19c1.02-8.21-2.94-13.38-10.43-18.78l71.15-77.94c10.45-11.45-29.38-5.83-38.03-10.74l55.66-19.75c8.42,1.13,18.08,4.19,27.71,7.37l-43.91,139.85,99.67,50.25-44.09,81.76-131.81-28.83c-.1-17.86,3.09-34.93,5.34-53.01Z';

function getColor(value, min, max) {
    if (max === min) return 'hsl(210, 60%, 85%)';
    const ratio = (value - min) / (max - min);
    const hue = 210;
    const lightness = 90 - ratio * 45;
    const saturation = 40 + ratio * 30;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.4;

const PUROK_NAMES = Object.keys(PUROK_PATHS);

export default function TibangaMap({ data = {}, dataLabel = 'Residents', onPurokClick, showSummary = true }) {
    const [hovered, setHovered] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [selected, setSelected] = useState(new Set());
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dragging = useRef(false);
    const lastPt = useRef({ x: 0, y: 0 });
    const viewportRef = useRef(null);
    const dropdownRef = useRef(null);

    const hasSelection = selected.size > 0;

    const { min, max } = useMemo(() => {
        const vals = Object.values(data).filter(v => typeof v === 'number');
        if (vals.length === 0) return { min: 0, max: 0 };
        return { min: Math.min(...vals), max: Math.max(...vals) };
    }, [data]);

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.closest('svg')?.getBoundingClientRect();
        if (!rect) return;
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const clampPan = useCallback((px, py, z) => {
        if (z <= 1) return { x: 0, y: 0 };
        const el = viewportRef.current;
        if (!el) return { x: px, y: py };
        const w = el.clientWidth;
        const h = el.clientHeight;
        const maxX = (w * (z - 1)) / 2;
        const maxY = (h * (z - 1)) / 2;
        return {
            x: Math.max(-maxX, Math.min(maxX, px)),
            y: Math.max(-maxY, Math.min(maxY, py)),
        };
    }, []);

    const handleZoom = useCallback((dir) => {
        setZoom(prev => {
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + dir * ZOOM_STEP));
            if (next <= 1) setPan({ x: 0, y: 0 });
            else setPan(p => clampPan(p.x, p.y, next));
            return next;
        });
    }, [clampPan]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const onWheel = (e) => {
            e.preventDefault();
            handleZoom(e.deltaY < 0 ? 1 : -1);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [handleZoom]);

    const onPointerDown = (e) => {
        if (zoom <= 1) return;
        dragging.current = true;
        lastPt.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!dragging.current) return;
        const dx = e.clientX - lastPt.current.x;
        const dy = e.clientY - lastPt.current.y;
        lastPt.current = { x: e.clientX, y: e.clientY };
        setPan(p => clampPan(p.x + dx, p.y + dy, zoom));
    };

    const onPointerUp = () => { dragging.current = false; };

    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    const togglePurok = (name) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(PUROK_NAMES));
    const clearAll = () => setSelected(new Set());

    useEffect(() => {
        if (!dropdownOpen) return;
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownOpen]);

    const legendValues = useMemo(() => {
        if (min === max) return [min];
        const steps = 5;
        return Array.from({ length: steps }, (_, i) =>
            Math.round(min + (max - min) * (i / (steps - 1)))
        );
    }, [min, max]);

    return (
        <div className={styles.mapContainer}>
            {/* Purok selector dropdown */}
            <div className={styles.selectorRow}>
                <div className={styles.dropdownWrap} ref={dropdownRef}>
                    <button
                        className={styles.dropdownTrigger}
                        onClick={() => setDropdownOpen(o => !o)}
                    >
                        <span>
                            {hasSelection
                                ? `${selected.size} Purok${selected.size > 1 ? 's' : ''} selected`
                                : 'Select Puroks'}
                        </span>
                        <svg width="12" height="8" viewBox="0 0 12 8" className={dropdownOpen ? styles.chevronUp : ''}>
                            <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
                        </svg>
                    </button>

                    {dropdownOpen && (
                        <div className={styles.dropdownPanel}>
                            <div className={styles.dropdownActions}>
                                <button className={styles.dropdownActionBtn} onClick={selectAll}>Select all</button>
                                <button className={styles.dropdownActionBtn} onClick={clearAll}>Clear all</button>
                            </div>
                            {PUROK_NAMES.map(name => (
                                <label key={name} className={styles.dropdownItem}>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(name)}
                                        onChange={() => togglePurok(name)}
                                        className={styles.dropdownCheckbox}
                                    />
                                    <span className={styles.dropdownName}>{name}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div
                ref={viewportRef}
                className={styles.mapViewport}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{ cursor: zoom > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'default' }}
            >
                {/* Zoom controls */}
                <div className={styles.zoomControls}>
                    <button className={styles.zoomBtn} onClick={() => handleZoom(1)} title="Zoom in">+</button>
                    <button className={styles.zoomBtn} onClick={() => handleZoom(-1)} title="Zoom out">&minus;</button>
                    <button className={styles.zoomBtn} onClick={resetView} title="Reset view">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 1 3 6.74"/><polyline points="3 22 3 16 9 16"/></svg>
                    </button>
                </div>

                <svg
                    viewBox="0 0 2080 2080"
                    className={styles.mapSvg}
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                        transformOrigin: 'center center',
                    }}
                >
                    <path d={CAMPUS_PATH} fill="#e8ecf0" stroke="#999" strokeWidth="2" />
                    <path d={CAMPUS_PATH_2} fill="#e8ecf0" stroke="#999" strokeWidth="2" />

                    {Object.entries(PUROK_PATHS).map(([name, { d, labelX, labelY }]) => {
                        const value = data[name] ?? 0;
                        const isSelected = selected.has(name);
                        const muted = hasSelection && !isSelected;
                        const fill = muted
                            ? '#e8ecf0'
                            : (data[name] !== undefined ? getColor(value, min, max) : '#f0f0f0');
                        const isHovered = hovered === name;

                        return (
                            <g key={name}>
                                <path
                                    d={d}
                                    fill={fill}
                                    stroke={isSelected ? '#0147AE' : isHovered ? '#0147AE' : (muted ? '#aaa' : '#222')}
                                    strokeWidth={isSelected ? 5 : isHovered ? 4 : 2.5}
                                    className={styles.purokPath}
                                    opacity={muted ? 0.5 : 1}
                                    onMouseEnter={() => setHovered(name)}
                                    onMouseMove={handleMouseMove}
                                    onMouseLeave={() => setHovered(null)}
                                    onClick={() => onPurokClick?.(name)}
                                    style={{ cursor: onPurokClick ? 'pointer' : 'default' }}
                                />
                                {isSelected && (
                                    <>
                                        <rect
                                            x={labelX - 45} y={labelY - 22}
                                            width="90" height="44" rx="10"
                                            fill="rgba(1,71,174,0.88)"
                                        />
                                        <text
                                            x={labelX} y={labelY - 4}
                                            textAnchor="middle"
                                            fontSize="18" fontWeight="700" fill="#fff"
                                        >
                                            {value}
                                        </text>
                                        <text
                                            x={labelX} y={labelY + 14}
                                            textAnchor="middle"
                                            fontSize="12" fill="rgba(255,255,255,0.8)"
                                        >
                                            {dataLabel}
                                        </text>
                                    </>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {hovered && (
                    <div
                        className={styles.tooltip}
                        style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 10 }}
                    >
                        <strong>{hovered}</strong>
                        <span>{dataLabel}: {data[hovered] ?? 0}</span>
                    </div>
                )}
            </div>

            {/* Footer: contextual summary */}
            {showSummary && (
                <div className={styles.selectionSummary}>
                    {!hasSelection ? (
                        <>
                            <span className={styles.summaryLabel}>Total {dataLabel}</span>
                            <span className={styles.summaryValue}>
                                {PUROK_NAMES.reduce((sum, n) => sum + (data[n] ?? 0), 0)}
                            </span>
                        </>
                    ) : selected.size === 1 ? (
                        (() => {
                            const name = [...selected][0];
                            return <>
                                <span className={styles.summaryLabel}>{name}</span>
                                <span className={styles.summaryValue}>{data[name] ?? 0} {dataLabel}</span>
                            </>;
                        })()
                    ) : (
                        <>
                            <span className={styles.summaryLabel}>{selected.size} Puroks Selected</span>
                            <span className={styles.summaryValue}>
                                {[...selected].reduce((sum, n) => sum + (data[n] ?? 0), 0)} {dataLabel}
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
