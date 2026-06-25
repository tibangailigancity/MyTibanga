/** Auto-generate login username as firstname.lastname (middle name excluded). */
export function generateResidentUsername({ firstName, lastName, explicitUsername }) {
    const manual = String(explicitUsername || '').trim();
    if (manual) return manual;

    const first = String(firstName || '').trim().toLowerCase().replace(/\s+/g, '');
    const last = String(lastName || '').trim().toLowerCase().replace(/\s+/g, '');
    if (first && last) return `${first}.${last}`;
    if (first) return first;
    if (last) return last;
    return '';
}
