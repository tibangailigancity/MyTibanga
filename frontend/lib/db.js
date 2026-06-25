/**
 * Database connection helper.
 *
 * HOW IT WORKS:
 * - We create a "pool" of connections to PostgreSQL.
 *   A pool keeps several connections open so each request
 *   doesn't need to connect/disconnect every time (much faster).
 *
 * - The `query` function is the one you'll use everywhere.
 *   Example:
 *     const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
 *
 *   $1, $2, $3... are "parameterized" placeholders — they prevent SQL injection.
 */

import pg from 'pg';
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const requiresSsl =
    process.env.NODE_ENV === 'production' ||
    databaseUrl?.includes('supabase.com') ||
    process.env.PGSSLMODE === 'require';

// Create a pool using DATABASE_URL. Supabase/Vercel needs SSL and short timeouts.
const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        ssl: requiresSsl ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
    })
    : {
        query() {
            throw new Error('DATABASE_URL is not configured.');
        },
        connect() {
            throw new Error('DATABASE_URL is not configured.');
        },
        end() {
            return Promise.resolve();
        },
    };

/**
 * Run a SQL query.
 * @param {string} text  - the SQL string (use $1, $2... for parameters)
 * @param {Array}  params - values for the placeholders
 * @returns {Promise<{rows: Array, rowCount: number}>}
 */
export async function query(text, params) {
    const result = await pool.query(text, params);
    return result;
}

export default pool;
