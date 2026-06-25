/** 6-digit numeric PIN — passes UniSMS filter (variant 12). */
export function generateRandomPassword() {
    let pin = '';
    for (let i = 0; i < 6; i++) {
        pin += Math.floor(Math.random() * 10);
    }
    // Avoid trivial repeats (e.g. 000000)
    if (/^(\d)\1{5}$/.test(pin)) return generateRandomPassword();
    return pin;
}
