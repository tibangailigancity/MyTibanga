'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import {
    buildRcdApiQueryString,
    collectionsToCsv,
    defaultDocStampForManual,
    formatMoney,
    formatRcdDisplayDate,
    groupCollectionsByDate,
    RCD_DOC_STAMP,
} from '@/lib/rcdCollections';
import styles from './RcdReport.module.css';

const TREASURER_STORAGE_KEY = 'rcdTreasurerName';

const MANUAL_PRESETS = [
    'VENUE RENTAL',
    'GYM RENTAL',
    'FILING FEE',
];

const emptyManualForm = (collectionDate = '') => ({
    collectionDate: collectionDate || new Date().toISOString().slice(0, 10),
    orNumber: '',
    payor: '',
    collectionName: '',
    amount: '',
    docStamp: String(RCD_DOC_STAMP),
});

export default function RcdReport() {
    const { showAlert, confirm, dialogs } = useAppDialogs();
    const [timeFilter, setTimeFilter] = useState('day');
    const [selectedDay, setSelectedDay] = useState(new Date().toISOString().slice(0, 10));
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [treasurerName, setTreasurerName] = useState('');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [manualForm, setManualForm] = useState(emptyManualForm());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(TREASURER_STORAGE_KEY);
            if (saved) setTreasurerName(saved);
        } catch {
            // ignore
        }
    }, []);

    const buildQueryString = useCallback(() => buildRcdApiQueryString({
        period: timeFilter,
        day: selectedDay,
        month: selectedMonth,
        year: selectedYear,
        treasurer: treasurerName,
    }), [timeFilter, selectedDay, selectedMonth, selectedYear, treasurerName]);

    const fetchRcd = useCallback(() => {
        setLoading(true);
        fetch(`/api/admin/rcd?${buildQueryString()}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => setData(payload))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [buildQueryString]);

    useEffect(() => {
        fetchRcd();
    }, [fetchRcd]);

    useEffect(() => {
        setManualForm((prev) => ({
            ...prev,
            collectionDate: timeFilter === 'day' ? selectedDay : (prev.collectionDate || selectedDay),
        }));
    }, [timeFilter, selectedDay]);

    const handleTreasurerChange = (value) => {
        setTreasurerName(value);
        try {
            localStorage.setItem(TREASURER_STORAGE_KEY, value);
        } catch {
            // ignore
        }
    };

    const handleManualChange = (field, value) => {
        setManualForm((prev) => {
            const next = { ...prev, [field]: value };
            if (field === 'collectionName') {
                const suggested = defaultDocStampForManual(value);
                if (prev.docStamp === '' || prev.docStamp === String(RCD_DOC_STAMP) || prev.docStamp === '0') {
                    next.docStamp = String(suggested);
                }
            }
            return next;
        });
    };

    const handleAddManual = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/admin/rcd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionDate: manualForm.collectionDate,
                    orNumber: manualForm.orNumber.trim(),
                    payor: manualForm.payor.trim(),
                    collectionName: manualForm.collectionName.trim(),
                    amount: Number(manualForm.amount || 0),
                    docStamp: Number(manualForm.docStamp || 0),
                }),
            });
            const payload = await res.json();
            if (!res.ok) {
                showAlert('Save failed', payload.error || 'Could not save collection entry.');
                return;
            }
            setManualForm(emptyManualForm(manualForm.collectionDate));
            fetchRcd();
        } catch {
            showAlert('Save failed', 'Could not save collection entry.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteManual = async (id) => {
        const confirmed = await confirm({
            title: 'Remove entry?',
            message: 'This manual collection entry will be removed from the report.',
            confirmLabel: 'Remove',
        });
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/admin/rcd?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            const payload = await res.json();
            if (!res.ok) {
                showAlert('Delete failed', payload.error || 'Could not delete entry.');
                return;
            }
            fetchRcd();
        } catch {
            showAlert('Delete failed', 'Could not delete entry.');
        }
    };

    const handlePrint = () => {
        window.open(
            `/api/admin/rcd/print?${buildQueryString()}`,
            '_blank',
            'noopener,noreferrer'
        );
    };

    const handleExportCsv = () => {
        if (!collections.length) {
            showAlert('Export unavailable', 'No data available to export.');
            return;
        }
        const csv = collectionsToCsv({
            treasurerName,
            periodLabel: data?.periodLabel || '',
            collections,
            totals,
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rcd-${timeFilter}-${selectedDay || selectedMonth || selectedYear}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const collections = data?.collections || [];
    const totals = data?.totals || { amount: 0, docStamp: 0 };
    const dateGroups = groupCollectionsByDate(collections);
    const showDateColumn = timeFilter !== 'day';
    const labelColSpan = showDateColumn ? 5 : 4;

    return (
        <>
            {dialogs}
            <div className={styles.rcdReport}>
                <div className={styles.toolbar}>
                    <div className={styles.toolbarFilters}>
                        <div className={styles.filterField}>
                            <label className={styles.label} htmlFor="rcd-period">Report period</label>
                            <select
                                id="rcd-period"
                                className={styles.selectInput}
                                value={timeFilter}
                                onChange={(e) => setTimeFilter(e.target.value)}
                            >
                                <option value="day">Daily</option>
                                <option value="week">Weekly</option>
                                <option value="month">Monthly</option>
                                <option value="year">Yearly</option>
                            </select>
                        </div>
                        {(timeFilter === 'day' || timeFilter === 'week') && (
                            <div className={styles.filterField}>
                                <label className={styles.label} htmlFor="rcd-day">
                                    {timeFilter === 'week' ? 'Week of' : 'Date'}
                                </label>
                                <input
                                    id="rcd-day"
                                    type="date"
                                    className={styles.dateInput}
                                    value={selectedDay}
                                    onChange={(e) => setSelectedDay(e.target.value)}
                                />
                            </div>
                        )}
                        {timeFilter === 'month' && (
                            <div className={styles.filterField}>
                                <label className={styles.label} htmlFor="rcd-month">Month</label>
                                <input
                                    id="rcd-month"
                                    type="month"
                                    className={styles.dateInput}
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                />
                            </div>
                        )}
                        {timeFilter === 'year' && (
                            <div className={styles.filterField}>
                                <label className={styles.label} htmlFor="rcd-year">Year</label>
                                <input
                                    id="rcd-year"
                                    type="number"
                                    min="2000"
                                    max="2100"
                                    className={styles.yearInput}
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                />
                            </div>
                        )}
                        <div className={styles.filterFieldWide}>
                            <label className={styles.label} htmlFor="rcd-treasurer">Barangay Treasurer</label>
                            <input
                                id="rcd-treasurer"
                                type="text"
                                className={styles.textInput}
                                placeholder="e.g. Doreen Jayl D. Banghal"
                                value={treasurerName}
                                onChange={(e) => handleTreasurerChange(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={styles.toolbarActions}>
                        <button type="button" className={styles.exportBtn} onClick={handleExportCsv}>
                            Export CSV
                        </button>
                        <button type="button" className={styles.printBtn} onClick={handlePrint}>
                            Print RCD
                        </button>
                    </div>
                </div>

                {data?.periodLabel && (
                    <p className={styles.periodLabel}>Showing collections for: <strong>{data.periodLabel}</strong></p>
                )}

                <p className={styles.hint}>
                    Portal requests (Clearance, Solo Parents, Residency) appear automatically when they have an OR number.
                    The configured fee includes a ₱30 doc stamp per copy — Amount shows the certificate fee only; Doc Stamp shows ₱30.
                    Free documents (Indigency, Motorized Banca) are not included. Add other services manually below.
                </p>

                {loading ? (
                    <div className={styles.loading}>Loading collections...</div>
                ) : (
                    <>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        {showDateColumn && <th>Date</th>}
                                        <th>Source</th>
                                        <th>OR No.</th>
                                        <th>Payor</th>
                                        <th>Collection</th>
                                        <th>Amount</th>
                                        <th>Doc Stamp</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {collections.length === 0 ? (
                                        <tr>
                                            <td colSpan={showDateColumn ? 8 : 7} className={styles.emptyRow}>
                                                No collections for this period yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        dateGroups.map((group) => (
                                            <Fragment key={group.date}>
                                                {group.rows.map((row) => (
                                                    <tr key={row.id}>
                                                        {showDateColumn && (
                                                            <td>{formatRcdDisplayDate(row.date)}</td>
                                                        )}
                                                        <td>
                                                            <span className={row.source === 'portal' ? styles.badgePortal : styles.badgeManual}>
                                                                {row.source === 'portal' ? 'Portal' : 'Manual'}
                                                            </span>
                                                        </td>
                                                        <td>{row.orNumber || '—'}</td>
                                                        <td>{row.payor || '—'}</td>
                                                        <td>{row.collectionName || '—'}</td>
                                                        <td className={styles.num}>₱{formatMoney(row.amount)}</td>
                                                        <td className={styles.num}>
                                                            {Number(row.docStamp) > 0 ? `₱${formatMoney(row.docStamp)}` : '—'}
                                                        </td>
                                                        <td>
                                                            {row.source === 'manual' && row.manualId ? (
                                                                <button
                                                                    type="button"
                                                                    className={styles.deleteBtn}
                                                                    onClick={() => handleDeleteManual(row.manualId)}
                                                                >
                                                                    Remove
                                                                </button>
                                                            ) : null}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className={styles.daySubtotalRow}>
                                                    <td colSpan={labelColSpan} className={styles.totalLabel}>Sub Total</td>
                                                    <td className={styles.num}>₱{formatMoney(group.subtotal.amount)}</td>
                                                    <td className={styles.num}>₱{formatMoney(group.subtotal.docStamp)}</td>
                                                    <td></td>
                                                </tr>
                                            </Fragment>
                                        ))
                                    )}
                                </tbody>
                                {dateGroups.length > 1 && (
                                    <tfoot>
                                        <tr>
                                            <td colSpan={labelColSpan} className={styles.totalLabel}>Grand Total</td>
                                            <td className={styles.num}>₱{formatMoney(totals.amount)}</td>
                                            <td className={styles.num}>₱{formatMoney(totals.docStamp)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        <div className={styles.manualSection}>
                            <h4 className={styles.manualTitle}>Add manual collection</h4>
                            <p className={styles.manualHint}>
                                Use for venue rental, gym rental, filing fee, or any other service not auto-filled from the portal.
                            </p>

                            <div className={styles.presetRow}>
                                <span className={styles.presetLabel}>Quick presets:</span>
                                {MANUAL_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        className={styles.presetBtn}
                                        onClick={() => handleManualChange('collectionName', preset)}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>

                            <form className={styles.manualForm} onSubmit={handleAddManual}>
                                <input
                                    className={styles.input}
                                    type="date"
                                    value={manualForm.collectionDate}
                                    onChange={(e) => handleManualChange('collectionDate', e.target.value)}
                                    required
                                    title="Collection date"
                                />
                                <input
                                    className={styles.input}
                                    placeholder="OR number"
                                    value={manualForm.orNumber}
                                    onChange={(e) => handleManualChange('orNumber', e.target.value)}
                                    required
                                />
                                <input
                                    className={styles.input}
                                    placeholder="Payor / resident name"
                                    value={manualForm.payor}
                                    onChange={(e) => handleManualChange('payor', e.target.value)}
                                    required
                                />
                                <input
                                    className={styles.input}
                                    placeholder="Name of collection"
                                    value={manualForm.collectionName}
                                    onChange={(e) => handleManualChange('collectionName', e.target.value)}
                                    required
                                />
                                <input
                                    className={styles.input}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Amount"
                                    value={manualForm.amount}
                                    onChange={(e) => handleManualChange('amount', e.target.value)}
                                    required
                                />
                                <input
                                    className={styles.input}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Doc stamp"
                                    value={manualForm.docStamp}
                                    onChange={(e) => handleManualChange('docStamp', e.target.value)}
                                />
                                <button type="submit" className={styles.addBtn} disabled={saving}>
                                    {saving ? 'Adding…' : 'Add entry'}
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
