'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { toPng } from 'html-to-image';
import {
    ResponsiveContainer, BarChart, Bar, Line, ComposedChart,
    XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { usePolling } from '@/hooks/usePolling';
import styles from './page.module.css';
import { useAppDialogs } from '@/hooks/useAppDialogs';
import RcdReport from '@/components/RcdReport';

const TibangaMap = dynamic(() => import('@/components/TibangaMap'), { ssr: false });

const AGE_COLORS = [
    '#FF6B6B', '#FF8787', '#FFA94D', '#FFD43B', '#A9E34B',
    '#69DB7C', '#38D9A9', '#3BC9DB', '#4DABF7', '#5C7CFA',
    '#7950F2', '#9775FA', '#DA77F2',
];

const REPORT_OPTIONS = [
    { value: 'monthlyDocs', label: 'Documents Requested Summary' },
    { value: 'collectionSummary', label: 'Collection Summary' },
    { value: 'rcd', label: 'Report of Collection and Deposits (RCD)' },
    { value: 'ageByPurok', label: 'Age Distribution per Purok' },
    { value: 'purokMap', label: 'Residents per Purok' },
];

export default function ReportsPage() {
    const { showAlert, dialogs } = useAppDialogs();
    const chartExportRef = useRef(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState('monthlyDocs');
    const [selectedPurok, setSelectedPurok] = useState('All');
    const [donutView, setDonutView] = useState('A');
    const [docReportTab, setDocReportTab] = useState('summary');
    const [purokMapTab, setPurokMapTab] = useState('map');
    const [timeFilter, setTimeFilter] = useState('month');
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [selectedDay, setSelectedDay] = useState(new Date().toISOString().slice(0, 10));
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDocument, setSelectedDocument] = useState('all');

    const fetchReport = useCallback((options = { silent: false }) => {
        if (selectedReport === 'rcd') {
            setLoading(false);
            return;
        }
        if (!options.silent) setLoading(true);
        const params = new URLSearchParams();
        if (selectedReport === 'monthlyDocs' || selectedReport === 'collectionSummary') {
            if (timeFilter === 'year' && selectedYear) {
                params.set('period', 'year');
                params.set('year', selectedYear);
            } else if ((timeFilter === 'day' || timeFilter === 'week') && selectedDay) {
                params.set('period', timeFilter);
                params.set('day', selectedDay);
            } else if (timeFilter === 'month' && selectedMonth) {
                params.set('period', 'month');
                params.set('month', selectedMonth);
            }
            if (selectedReport === 'monthlyDocs') {
                params.set('document', selectedDocument || 'all');
            }
        }
        const qs = params.toString();
        fetch(`/api/admin/reports${qs ? `?${qs}` : ''}`)
            .then(res => res.ok ? res.json() : null)
            .then(d => { if (d) setData(d); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [selectedReport, timeFilter, selectedYear, selectedDay, selectedMonth, selectedDocument]);

    useEffect(() => { fetchReport(); }, [fetchReport]);
    usePolling(() => fetchReport({ silent: true }), 15000);

    const formatCurrency = (amt) => `₱${(amt || 0).toLocaleString()}`;

    const summary = data?.summary || {};
    const monthlyDocs = data?.monthlyDocs || [];
    const collectionSummary = data?.collectionSummary || {};
    const collectionSeries = collectionSummary?.series || [];
    const documentQuantitySummary = data?.documentQuantitySummary || {};
    const documentQuantitySeries = documentQuantitySummary?.series || [];
    const availableDocuments = data?.availableDocuments || [];
    const availableYears = data?.availableYears || [];
    const ageByPurok = data?.ageByPurok || {};
    const purokStats = data?.purokStats || [];
    const purokMap = data?.purokMap || {};
    const purokNames = Object.keys(ageByPurok).filter(k => k !== 'All');

    const sanitizeFilePart = (value) =>
        String(value || 'report')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'report';

    const exportFileNameBase = () => {
        const reportLabel = REPORT_OPTIONS.find((r) => r.value === selectedReport)?.label || selectedReport;
        const datePart = new Date().toISOString().slice(0, 10);
        return `${sanitizeFilePart(reportLabel)}-${datePart}`;
    };

    const rowsToCsv = (rows) => {
        if (!rows.length) return '';
        const headers = Object.keys(rows[0]);
        const escapeCell = (cell) => {
            const value = cell == null ? '' : String(cell);
            if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
            return value;
        };
        const lines = [
            headers.join(','),
            ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
        ];
        return lines.join('\n');
    };

    const triggerDownload = (content, filename, mimeType) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const getCsvRows = () => {
        if (selectedReport === 'monthlyDocs') {
            if (docReportTab === 'summary') {
                return monthlyDocs.map((row) => ({
                    Period: row.label,
                    Requests: row.count || 0,
                    Document: selectedDocument === 'all' ? 'All Documents' : selectedDocument,
                }));
            }
            return documentQuantitySeries.map((row) => ({
                Period: row.label,
                Quantity: row.quantity || 0,
                Document: selectedDocument === 'all' ? 'All Documents' : selectedDocument,
            }));
        }

        if (selectedReport === 'collectionSummary') {
            return collectionSeries.map((row) => ({
                Period: row.label,
                Collection: row.amount || 0,
                Transactions: row.transactions || 0,
            }));
        }

        if (selectedReport === 'ageByPurok') {
            const names = donutView === 'A' ? [selectedPurok] : ['All', ...purokNames];
            return names.flatMap((name) => {
                const bracketRows = ageByPurok[name] || [];
                return bracketRows.map((bucket) => ({
                    Purok: name === 'All' ? 'All Puroks' : name,
                    AgeBracket: bucket.label,
                    Residents: bucket.count || 0,
                }));
            });
        }

        if (selectedReport === 'purokMap') {
            return purokStats.map((row) => ({
                Purok: row.name,
                Residents: row.count || 0,
            }));
        }

        return [];
    };

    const handleExportCsv = () => {
        const rows = getCsvRows();
        if (!rows.length) {
            showAlert('Export unavailable', 'No data available to export.');
            return;
        }
        const csv = rowsToCsv(rows);
        triggerDownload(csv, `${exportFileNameBase()}.csv`, 'text/csv;charset=utf-8;');
    };

    const handleExportPng = async () => {
        if (!chartExportRef.current) {
            showAlert('Export unavailable', 'Chart is not ready yet.');
            return;
        }
        try {
            const node = chartExportRef.current;
            const rect = node.getBoundingClientRect();
            const width = Math.max(900, Math.round(rect.width));
            const height = Math.max(520, Math.round(rect.height));

            const dataUrl = await toPng(node, {
                cacheBust: true,
                pixelRatio: 3,
                backgroundColor: '#ffffff',
                width,
                height,
                canvasWidth: width * 2,
                canvasHeight: height * 2,
                style: {
                    background: '#ffffff',
                    borderRadius: '12px',
                    padding: '12px',
                },
            });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${exportFileNameBase()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch {
            showAlert('Export failed', 'Could not export PNG. Please try again.');
        }
    };

    const renderTimeFilters = () => (
        <div className={styles.reportFilterRow}>
            <select className={styles.selectorDropdown} value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                <option value="day">By day</option>
                <option value="week">By week</option>
                <option value="month">By month</option>
                <option value="year">By year</option>
            </select>
            {(timeFilter === 'day' || timeFilter === 'week') && (
                <input
                    type="date"
                    className={styles.dateInput}
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                />
            )}
            {timeFilter === 'month' && (
                <input
                    type="month"
                    className={styles.dateInput}
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                />
            )}
            {timeFilter === 'year' && (
                <select className={styles.selectorDropdown} value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                    {(availableYears.length > 0 ? availableYears : [new Date().getFullYear()]).map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                    ))}
                </select>
            )}
            {selectedReport === 'monthlyDocs' && (
                <select
                    className={styles.selectorDropdown}
                    value={selectedDocument}
                    onChange={(e) => setSelectedDocument(e.target.value)}
                >
                    <option value="all">All Documents</option>
                    {availableDocuments.map((docName) => (
                        <option key={docName} value={docName}>{docName}</option>
                    ))}
                </select>
            )}
        </div>
    );

    const renderChart = () => {
        const docChartSeries = docReportTab === 'summary' ? monthlyDocs : documentQuantitySeries;
        switch (selectedReport) {
            case 'monthlyDocs':
                return (
                    <div className={styles.chartArea}>
                        <p className={styles.chartDesc}>
                            View document requests as either request count or total quantity across the selected time range.
                        </p>
                        {renderTimeFilters()}
                        <div className={styles.viewToggle}>
                            <button
                                className={`${styles.toggleBtn} ${docReportTab === 'summary' ? styles.toggleActive : ''}`}
                                onClick={() => setDocReportTab('summary')}
                            >
                                Document Requested Summary
                            </button>
                            <button
                                className={`${styles.toggleBtn} ${docReportTab === 'quantity' ? styles.toggleActive : ''}`}
                                onClick={() => setDocReportTab('quantity')}
                            >
                                Document Quantity Requested
                            </button>
                        </div>
                        <div className={styles.collectionStats}>
                            <div className={styles.collectionStat}>
                                <span className={styles.collectionLabel}>
                                    {docReportTab === 'summary' ? 'Total Requests' : 'Total Quantity'}
                                </span>
                                <span className={styles.collectionValue}>
                                    {docReportTab === 'summary'
                                        ? monthlyDocs.reduce((sum, row) => sum + (row.count || 0), 0)
                                        : (documentQuantitySummary.total || 0)}
                                </span>
                            </div>
                            <div className={styles.collectionStat}>
                                <span className={styles.collectionLabel}>Document</span>
                                <span className={styles.collectionValue}>
                                    {selectedDocument === 'all' ? 'All Documents' : selectedDocument}
                                </span>
                            </div>
                            <div className={styles.collectionStat}>
                                <span className={styles.collectionLabel}>View</span>
                                <span className={styles.collectionValue}>
                                    {docReportTab === 'summary' ? 'Request Count' : 'Quantity Count'}
                                </span>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={docChartSeries} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ecf0" />
                                <XAxis dataKey="shortLabel" tick={{ fontSize: 12, fill: '#666' }} tickLine={false} axisLine={{ stroke: '#e8ecf0' }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#666' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value) => [value, docReportTab === 'summary' ? 'Requests' : 'Quantity']}
                                    labelFormatter={(label) => {
                                        const source = docReportTab === 'summary' ? monthlyDocs : documentQuantitySeries;
                                        const m = source.find(d => d.shortLabel === label);
                                        return m?.label || label;
                                    }}
                                    contentStyle={{ borderRadius: 8, border: '1px solid #e0e5eb', fontSize: '0.85rem' }}
                                />
                                <defs>
                                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#2979ff" />
                                        <stop offset="100%" stopColor="#0147AE" />
                                    </linearGradient>
                                    <linearGradient id="docQtyGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#7c4dff" />
                                        <stop offset="100%" stopColor="#5b35d5" />
                                    </linearGradient>
                                </defs>
                                {docReportTab === 'summary' ? (
                                    <Bar dataKey="count" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                                ) : (
                                    <Bar dataKey="quantity" fill="url(#docQtyGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'collectionSummary':
                return (
                    <div className={styles.chartArea}>
                        <p className={styles.chartDesc}>
                            Revenue collected from completed document requests across the selected time range.
                        </p>
                        {renderTimeFilters()}
                        <div className={styles.collectionStats}>
                            <div className={styles.collectionStat}>
                                <span className={styles.collectionLabel}>Total Collection</span>
                                <span className={styles.collectionValue}>{formatCurrency(collectionSummary.total || 0)}</span>
                            </div>
                            <div className={styles.collectionStat}>
                                <span className={styles.collectionLabel}>Average / Period</span>
                                <span className={styles.collectionValue}>{formatCurrency(Math.round(collectionSummary.average || 0))}</span>
                            </div>
                            <div className={styles.collectionStat}>
                                <span className={styles.collectionLabel}>Peak Period</span>
                                <span className={styles.collectionValue}>
                                    {collectionSummary.peakLabel || '—'}
                                    {collectionSummary.peakLabel ? ` (${formatCurrency(collectionSummary.peakAmount || 0)})` : ''}
                                </span>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={collectionSeries} margin={{ top: 20, right: 16, left: 4, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ecf0" />
                                <XAxis dataKey="shortLabel" tick={{ fontSize: 12, fill: '#666' }} tickLine={false} axisLine={{ stroke: '#e8ecf0' }} />
                                <YAxis
                                    yAxisId="left"
                                    tick={{ fontSize: 12, fill: '#666' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => formatCurrency(value)}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    allowDecimals={false}
                                    tick={{ fontSize: 12, fill: '#666' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    formatter={(value, name) => {
                                        if (name === 'Collection') return [formatCurrency(value), name];
                                        return [value, name];
                                    }}
                                    labelFormatter={(label) => {
                                        const m = collectionSeries.find(d => d.shortLabel === label);
                                        return m?.label || label;
                                    }}
                                    contentStyle={{ borderRadius: 8, border: '1px solid #e0e5eb', fontSize: '0.85rem' }}
                                />
                                <defs>
                                    <linearGradient id="moneyGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34c759" />
                                        <stop offset="100%" stopColor="#2f9e44" />
                                    </linearGradient>
                                </defs>
                                <Legend
                                    verticalAlign="bottom"
                                    iconType="line"
                                    iconSize={12}
                                    formatter={(value) => <span style={{ color: '#444', fontSize: '0.82rem' }}>{value}</span>}
                                />
                                <Bar
                                    yAxisId="left"
                                    dataKey="amount"
                                    name="Collection"
                                    fill="url(#moneyGrad)"
                                    radius={[6, 6, 0, 0]}
                                    maxBarSize={38}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="transactions"
                                    name="Transactions"
                                    stroke="#e67e22"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={false}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                );
            case 'ageByPurok': {
                const currentData = ageByPurok[selectedPurok] || [];
                const total = currentData.reduce((s, d) => s + d.count, 0);

                return (
                    <div className={styles.chartArea}>
                        <p className={styles.chartDesc}>Age distribution of all registered residents per Purok.</p>

                        {/* View toggle */}
                        <div className={styles.viewToggle}>
                            <button className={`${styles.toggleBtn} ${donutView === 'A' ? styles.toggleActive : ''}`} onClick={() => setDonutView('A')}>Single View</button>
                            <button className={`${styles.toggleBtn} ${donutView === 'B' ? styles.toggleActive : ''}`} onClick={() => setDonutView('B')}>Grid View</button>
                        </div>

                        {donutView === 'A' ? (
                            <>
                                <div className={styles.purokSelect}>
                                    <select className={styles.selectorDropdown} value={selectedPurok} onChange={e => setSelectedPurok(e.target.value)}>
                                        <option value="All">All Puroks</option>
                                        {purokNames.map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                                <div className={styles.donutWrap}>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={currentData}
                                                dataKey="count"
                                                nameKey="label"
                                                cx="50%" cy="50%"
                                                innerRadius={75} outerRadius={120}
                                                paddingAngle={2}
                                                strokeWidth={2}
                                                stroke="#fff"
                                            >
                                                {currentData.map((_, i) => (
                                                    <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value, name) => [value, name]}
                                                contentStyle={{ borderRadius: 8, border: '1px solid #e0e5eb', fontSize: '0.85rem' }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                iconType="circle"
                                                iconSize={10}
                                                formatter={(value) => <span style={{ color: '#444', fontSize: '0.82rem' }}>{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className={styles.donutCenter}>
                                        <span className={styles.donutTotal}>{total}</span>
                                        <span className={styles.donutTotalLabel}>Residents</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.donutGrid}>
                                    {['All', ...purokNames].map(name => {
                                        const pData = ageByPurok[name] || [];
                                        const pTotal = pData.reduce((s, d) => s + d.count, 0);
                                        return (
                                            <div key={name} className={styles.miniDonutCard}>
                                                <div className={styles.miniDonutWrap}>
                                                    <ResponsiveContainer width="100%" height={120}>
                                                        <PieChart>
                                                            <Pie
                                                                data={pData}
                                                                dataKey="count"
                                                                nameKey="label"
                                                                cx="50%" cy="50%"
                                                                innerRadius={30} outerRadius={50}
                                                                paddingAngle={1}
                                                                strokeWidth={1}
                                                                stroke="#fff"
                                                            >
                                                                {pData.map((_, i) => (
                                                                    <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                formatter={(value, n) => [value, n]}
                                                                contentStyle={{ borderRadius: 6, border: '1px solid #e0e5eb', fontSize: '0.75rem' }}
                                                            />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                    <div className={styles.miniDonutCenter}>
                                                        <span className={styles.miniDonutTotal}>{pTotal}</span>
                                                    </div>
                                                </div>
                                                <span className={styles.miniDonutLabel}>{name === 'All' ? 'All Puroks' : name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Shared legend */}
                                <div className={styles.gridLegend}>
                                    {(ageByPurok.All || []).map((b, i) => (
                                        <span key={b.label} className={styles.gridLegendItem}>
                                            <span className={styles.gridLegendDot} style={{ background: AGE_COLORS[i] }} />
                                            {b.label}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                );
            }

            case 'purokMap':
                return (
                    <div className={styles.chartArea}>
                        <p className={styles.chartDesc}>Choropleth map showing the distribution of registered residents per Purok in Barangay Tibanga.</p>
                        <div className={styles.viewToggle}>
                            <button
                                className={`${styles.toggleBtn} ${purokMapTab === 'map' ? styles.toggleActive : ''}`}
                                onClick={() => setPurokMapTab('map')}
                            >
                                Map
                            </button>
                            <button
                                className={`${styles.toggleBtn} ${purokMapTab === 'table' ? styles.toggleActive : ''}`}
                                onClick={() => setPurokMapTab('table')}
                            >
                                Table
                            </button>
                        </div>
                        {purokMapTab === 'map' ? (
                            <TibangaMap data={purokMap} dataLabel="Residents" showSummary={false} />
                        ) : (
                            <div className={styles.purokTableWrap}>
                                <table className={styles.purokTable}>
                                    <thead>
                                        <tr>
                                            <th>Purok</th>
                                            <th>Residents</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purokStats.length === 0 ? (
                                            <tr>
                                                <td colSpan="2" className={styles.purokEmptyRow}>No purok data found.</td>
                                            </tr>
                                        ) : (
                                            purokStats.map((row) => (
                                                <tr key={row.name}>
                                                    <td>{row.name}</td>
                                                    <td>{row.count}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td>Total</td>
                                            <td>{summary.totalResidents || 0}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <>
            {dialogs}
        <div className={styles.reports}>
            {selectedReport === 'rcd' ? (
                <>
                    <div className={styles.reportSelector}>
                        <label className={styles.selectorLabel}>Select Report</label>
                        <select className={styles.selectorDropdown} value={selectedReport} onChange={e => setSelectedReport(e.target.value)}>
                            {REPORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className={styles.chartCard}>
                        <RcdReport />
                    </div>
                </>
            ) : loading && !data ? (
                <div className={styles.loadingState}>Loading report data...</div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className={styles.kpiCards}>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiIcon}>👥</span>
                            <span className={styles.kpiNumber}>{summary.totalResidents || 0}</span>
                            <span className={styles.kpiLabel}>Total Residents</span>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiIcon}>📄</span>
                            <span className={`${styles.kpiNumber} ${styles.kpiBlue}`}>{summary.totalRequests || 0}</span>
                            <span className={styles.kpiLabel}>Total Requests</span>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiIcon}>💰</span>
                            <span className={`${styles.kpiNumber} ${styles.kpiGreen}`}>{formatCurrency(summary.totalRevenue)}</span>
                            <span className={styles.kpiLabel}>Total Revenue</span>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.kpiIcon}>✅</span>
                            <span className={`${styles.kpiNumber} ${styles.kpiOrange}`}>{summary.completionRate || 0}%</span>
                            <span className={styles.kpiLabel}>Completion Rate</span>
                        </div>
                    </div>

                    {/* Report Selector */}
                    <div className={styles.reportSelector}>
                        <label className={styles.selectorLabel}>Select Report</label>
                        <select className={styles.selectorDropdown} value={selectedReport} onChange={e => setSelectedReport(e.target.value)}>
                            {REPORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Chart Container */}
                    <div className={styles.chartCard}>
                        <div className={styles.chartHeader}>
                            <h3 className={styles.chartTitle}>
                                {REPORT_OPTIONS.find(o => o.value === selectedReport)?.label}
                            </h3>
                            <div className={styles.exportActions}>
                                <button className={styles.exportBtn} onClick={handleExportPng}>
                                    Export Chart (PNG)
                                </button>
                                <button className={styles.exportBtn} onClick={handleExportCsv}>
                                    Export Data (CSV)
                                </button>
                            </div>
                        </div>
                        <div ref={chartExportRef}>
                            {renderChart()}
                        </div>
                    </div>
                </>
            )}
        </div>
        </>
    );
}
