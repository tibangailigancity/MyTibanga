/**
 * One-off: checks if public.requests.user_id exists.
 * Run from repo: node scripts/check-requests-user-id.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/^DATABASE_URL=(.+)$/m);
    if (m) databaseUrl = m[1].trim().replace(/^["']|["']$/g, '');
}

if (!databaseUrl) {
    console.log('No DATABASE_URL (set env or add frontend/.env.local).');
    process.exit(2);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
    const { rows } = await pool.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'requests'
           AND column_name = 'user_id'`
    );
    if (rows.length > 0) {
        console.log('OK: column requests.user_id exists (' + rows[0].data_type + ').');
        console.log('You do not need to run add_requests_user_id.sql unless you want to ensure the index exists.');
    } else {
        console.log('MISSING: requests.user_id is not in the database.');
        console.log('Run: psql ... -f db/add_requests_user_id.sql');
    }
} catch (e) {
    console.log('Could not query database:', e.message);
    process.exit(1);
} finally {
    await pool.end();
}
