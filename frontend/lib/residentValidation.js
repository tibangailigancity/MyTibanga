/** Returns an error message, or null if valid. */
export function validateSoloParentSector(sector, children) {
    if (String(sector || '').trim() !== 'Solo parent') return null;
    const names = Array.isArray(children) ? children : [];
    const hasChild = names.some((c) => String(c || '').trim());
    if (!hasChild) {
        return 'Solo parent sector requires at least one child name.';
    }
    return null;
}
