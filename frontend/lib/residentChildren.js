/**
 * Children names (TEXT[]) and parallel ages (TEXT[]) for residents.
 */

/** Save: keep only rows with a non-empty child name; align ages by index. */
export function normalizeChildrenArrays(children, childrenAges) {
    const names = Array.isArray(children) ? children : [];
    const ages = Array.isArray(childrenAges) ? childrenAges : [];
    const outNames = [];
    const outAges = [];
    names.forEach((n, i) => {
        const name = String(n ?? '').trim();
        if (!name) return;
        outNames.push(name);
        const raw = ages[i];
        const age = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
        outAges.push(age);
    });
    return { children: outNames, childrenAges: outAges };
}

/** Load into form: one row minimum; pad ages to match name slots. */
export function alignChildrenFormArrays(children, childrenAges) {
    let names = Array.isArray(children) && children.length ? [...children] : [''];
    if (names.length === 0) names = [''];
    const ages = names.map((_, i) => {
        if (!Array.isArray(childrenAges) || childrenAges[i] == null) return '';
        return String(childrenAges[i]);
    });
    return { children: names, childrenAges: ages };
}

/** Show name with optional deceased suffix for parent/spouse fields */
export function formatNameWithDeceased(name, deceased) {
    const n = String(name || '').trim();
    if (!n) return '—';
    return deceased ? `${n} (deceased)` : n;
}

/** Table / modal display: "Ana (7), Ben (4)" */
export function formatChildrenWithAges(children, childrenAges) {
    if (!Array.isArray(children) || !children.some((c) => String(c || '').trim())) return '';
    const ages = Array.isArray(childrenAges) ? childrenAges : [];
    return children
        .map((name, i) => {
            const n = String(name || '').trim();
            if (!n) return '';
            const a = ages[i] != null ? String(ages[i]).trim() : '';
            return a ? `${n} (${a})` : n;
        })
        .filter(Boolean)
        .join(', ');
}
