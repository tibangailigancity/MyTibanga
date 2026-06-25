/**
 * Send one welcome-SMS test variant at a time (UniSMS content filter debugging).
 *
 * Usage (from frontend/):
 *   node --use-system-ca scripts/test-sms-variants.mjs list
 *   node --use-system-ca scripts/test-sms-variants.mjs 1 09651527400
 *
 * Each variant sends ONE real SMS — run one number at a time and check your phone.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

for (const line of fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : []) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const { sendSMS, formatSmsError } = await import('../lib/sms.js');

const SAMPLE_USER = 'test.user';
const SAMPLE_CODE = 'TestCd12';
const SAMPLE_PIN = '482917';
const SAMPLE_WORD = 'bundok48';

/** @type {{ id: number, key: string, label: string, build: () => string }[]} */
const VARIANTS = [
    {
        id: 0,
        key: 'plain',
        label: 'Plain notice (no code, no credentials)',
        build: () => 'Brgy Tibanga: Your portal account is ready. Visit the barangay office for details.',
    },
    {
        id: 1,
        key: 'production',
        label: 'Current production welcome SMS (6-digit PIN)',
        build: () =>
            `Brgy Tibanga: Your portal account is ready. Password: ${SAMPLE_PIN}.`,
    },
    {
        id: 7,
        key: 'minimal-code',
        label: 'Shortest message with code only',
        build: () => `Brgy Tibanga: Code ${SAMPLE_CODE}.`,
    },
    {
        id: 2,
        key: 'dot-username',
        label: 'Username with dot + code (no Pass/password words)',
        build: () =>
            `Brgy Tibanga: Username ${SAMPLE_USER}. Login code ${SAMPLE_CODE}. Change code after first login.`,
    },
    {
        id: 3,
        key: 'dot-only',
        label: 'Only the dotted username in a short sentence',
        build: () => `Brgy Tibanga: Your portal username is ${SAMPLE_USER}.`,
    },
    {
        id: 4,
        key: 'pass-no-dot',
        label: 'User + Pass pattern without a dot (testuser)',
        build: () =>
            `MyTibangaPortal: User testuser Pass ${SAMPLE_CODE}. Change password on first login.`,
    },
    {
        id: 5,
        key: 'password-word',
        label: 'Code + word "password", no username',
        build: () =>
            `Brgy Tibanga: Your login code is ${SAMPLE_CODE}. Change password on first login.`,
    },
    {
        id: 8,
        key: 'pin-only',
        label: 'Pin word + random string (no username)',
        build: () => `Brgy Tibanga: Your portal account is ready. Pin ${SAMPLE_CODE}.`,
    },
    {
        id: 9,
        key: 'open-with',
        label: 'Natural sentence with password embedded',
        build: () => `Brgy Tibanga: Your portal account is ready. Open with ${SAMPLE_CODE}.`,
    },
    {
        id: 10,
        key: 'portal-dash',
        label: 'Portal dash password (minimal)',
        build: () => `Brgy Tibanga: MyTibangaPortal — ${SAMPLE_CODE}`,
    },
    {
        id: 11,
        key: 'start-with',
        label: 'Start with password',
        build: () => `Brgy Tibanga: Your account is ready. Start with ${SAMPLE_CODE}.`,
    },
    {
        id: 12,
        key: 'numeric-use',
        label: '6-digit PIN with "Use"',
        build: () => `Brgy Tibanga: Your portal account is ready. Use ${SAMPLE_PIN}.`,
    },
    {
        id: 13,
        key: 'numeric-tl',
        label: '6-digit PIN in Tagalog',
        build: () => `Brgy Tibanga: Handa na ang portal account mo. Gamitin ang ${SAMPLE_PIN}.`,
    },
    {
        id: 14,
        key: 'numeric-minimal',
        label: '6-digit PIN minimal (dash)',
        build: () => `Brgy Tibanga: MyTibangaPortal — ${SAMPLE_PIN}`,
    },
    {
        id: 15,
        key: 'word-pass',
        label: 'Word + digits password (bundok48)',
        build: () => `Brgy Tibanga: Your portal account is ready. Use ${SAMPLE_WORD}.`,
    },
    {
        id: 16,
        key: 'numeric-ref',
        label: '6-digit PIN as reference number',
        build: () => `Brgy Tibanga: Account ready. Ref ${SAMPLE_PIN}.`,
    },
    {
        id: 17,
        key: 'numeric-tl-short',
        label: 'Tagalog short with PIN at end',
        build: () => `Brgy Tibanga: Salamat. Handa na ang portal account mo. ${SAMPLE_PIN}`,
    },
    {
        id: 18,
        key: 'numeric-access',
        label: 'Access sentence + PIN only',
        build: () => `Brgy Tibanga: You may now access MyTibangaPortal. ${SAMPLE_PIN}`,
    },
];

function printList() {
    console.log('\nSMS test variants (run ONE at a time):\n');
    for (const v of VARIANTS) {
        console.log(`  ${v.id}. [${v.key}] ${v.label}`);
        console.log(`     → ${v.build()}\n`);
    }
    console.log('Example: node --use-system-ca scripts/test-sms-variants.mjs 1 09651527400\n');
}

const arg = process.argv[2];
const phone = process.argv[3];

if (!arg || arg === 'list' || arg === 'help' || arg === '-h') {
    printList();
    process.exit(0);
}

const variant = VARIANTS.find((v) => String(v.id) === arg || v.key === arg);
if (!variant) {
    console.error(`Unknown variant: ${arg}`);
    printList();
    process.exit(1);
}

if (!phone) {
    console.error('Missing phone. Example: node --use-system-ca scripts/test-sms-variants.mjs 1 09651527400');
    process.exit(1);
}

const message = variant.build();
console.log(`\nVariant ${variant.id} [${variant.key}]: ${variant.label}`);
console.log(`To: ${phone}`);
console.log(`Message (${message.length} chars):\n${message}\n`);

const result = await sendSMS(phone, message);
if (result.success) {
    console.log('RESULT: SENT OK');
    if (result.data?.message?.reference_id) {
        console.log('reference_id:', result.data.message.reference_id);
    }
} else {
    console.log('RESULT: REJECTED');
    console.log('reason:', formatSmsError(result.error));
}
