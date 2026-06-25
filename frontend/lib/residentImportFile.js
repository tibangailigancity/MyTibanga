/** Convert uploaded CSV or Excel (.xlsx / .xls) to CSV text for resident import. */
export async function readResidentImportFile(file) {
    if (!file) throw new Error('No file selected');

    const name = String(file.name || '').toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

    if (isExcel) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Excel file has no worksheets');
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        if (!csv.trim()) throw new Error('Excel worksheet is empty');
        return csv;
    }

    const text = await file.text();
    if (!text.trim()) throw new Error('File is empty');
    return text;
}

export const RESIDENT_IMPORT_ACCEPT =
    '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
