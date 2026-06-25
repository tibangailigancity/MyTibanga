/**
 * Seed script — copies your existing JSON data into PostgreSQL.
 *
 * Run it once with:   node db/seed.js
 *
 * HOW IT WORKS:
 *  1. Reads each JSON file from the `data/` folder
 *  2. INSERTs every record into the matching database table
 *  3. For requests, also inserts the nested document line-items
 *
 * IMPORTANT: This uses TRUNCATE to clear existing data first,
 * so you can safely re-run it if something goes wrong.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:lestat368@localhost:5432/barangay';
const requiresSsl =
    process.env.PGSSLMODE === 'require' ||
    databaseUrl.includes('supabase.com');

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: requiresSsl ? { rejectUnauthorized: false } : false,
});

function readJSON(filename) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        console.log(`  Warning: Could not read ${filename}, skipping.`);
        return null;
    }
}

async function seed() {
    const client = await pool.connect();

    try {
        console.log('Starting seed...\n');

        // Begin a transaction so everything succeeds or fails together
        await client.query('BEGIN');

        // Clear all tables (TRUNCATE is faster than DELETE)
        await client.query(`
            TRUNCATE users, residents, requests, request_documents,
                     documents, settings, announcements, homepage
            CASCADE
        `);
        console.log('  Tables cleared');

        // -- 1. Users --
        const users = readJSON('users.json');
        if (users) {
            for (const u of users) {
                await client.query(
                    `INSERT INTO users (id, name, username, email, password, role, super_admin, permissions)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [u.id, u.name, u.username, u.email || '', u.password, u.role, u.superAdmin || false, u.permissions || []]
                );
            }
            await client.query(`SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id),0) FROM users))`);
            console.log('  Seeded ' + users.length + ' users');
        }

        // -- 2. Residents --
        const residents = readJSON('residents.json');
        if (residents) {
            for (const r of residents) {
                const chArr = r.children || [];
                const caArr = Array.isArray(r.childrenAges) ? r.childrenAges : [];
                const agesPadded = chArr.map((_, i) => (caArr[i] != null ? String(caArr[i]) : ''));
                await client.query(
                    `INSERT INTO residents (
                        id, first_name, middle_name, last_name, suffix,
                        sex, civil_status, birthdate, birthplace, religion, household, housing_status, solo_parent,
                        citizenship, purok, barangay, city, mobile_number,
                        email, mothers_maiden_name, fathers_name, spouses_name,
                        mother_deceased, father_deceased, spouse_deceased,
                        childs_name, childs_mother, children, children_ages, username, password, id_picture
                     ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
                     )`,
                    [
                        r.id, r.firstName, r.middleName || '', r.lastName, r.suffix || '',
                        r.sex || '', r.civilStatus || '', r.birthdate || '', r.birthplace || '', r.religion || '', r.household || '', r.housingStatus || '',
                        !!r.soloParent,
                        r.citizenship || '', r.purok || '', r.barangay || 'Tibanga', r.city || 'Iligan City', r.mobileNumber || '',
                        r.email || '', r.mothersMaidenName || '', r.fathersName || '', r.spousesName || '',
                        !!r.motherDeceased, !!r.fatherDeceased, !!r.spouseDeceased,
                        r.childsName || '', r.childsMother || '', chArr, agesPadded, r.username || '', r.password || '', r.idPicture || ''
                    ]
                );
            }
            await client.query(`SELECT setval('residents_id_seq', (SELECT COALESCE(MAX(id),0) FROM residents))`);
            console.log('  Seeded ' + residents.length + ' residents');
        }

        // -- 3. Requests + Request Documents --
        const requests = readJSON('requests.json');
        if (requests) {
            for (const req of requests) {
                const result = await client.query(
                    `INSERT INTO requests (id, request_no, resident_name, total_amount, date, status, payment_method, reference_no, or_number, rejection_reason)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
                    [
                        req.id, req.requestNo, req.residentName, req.totalAmount,
                        req.date || '', req.status || 'pending', req.paymentMethod || 'cash',
                        req.referenceNo || '', req.orNumber || '', req.rejectionReason || ''
                    ]
                );
                const requestId = result.rows[0].id;

                if (Array.isArray(req.documents)) {
                    for (const doc of req.documents) {
                        await client.query(
                            `INSERT INTO request_documents (request_id, name, quantity, unit_price, total)
                             VALUES ($1,$2,$3,$4,$5)`,
                            [requestId, doc.name, doc.quantity || 1, doc.unitPrice || 0, doc.total || 0]
                        );
                    }
                }
            }
            await client.query(`SELECT setval('requests_id_seq', (SELECT COALESCE(MAX(id),0) FROM requests))`);
            console.log('  Seeded ' + requests.length + ' requests');
        }

        // -- 4. Documents --
        const docs = readJSON('documents.json');
        if (docs) {
            for (const d of docs) {
                await client.query(
                    `INSERT INTO documents (id, name, preview, file, date_modified, date_uploaded)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [d.id, d.name, d.preview || '', d.file || '', d.dateModified || '', d.dateUploaded || '']
                );
            }
            await client.query(`SELECT setval('documents_id_seq', (SELECT COALESCE(MAX(id),0) FROM documents))`);
            console.log('  Seeded ' + docs.length + ' documents');
        }

        // -- 5. Settings (documentFees + puroks) --
        const settings = readJSON('settings.json');
        if (settings) {
            await client.query(
                `INSERT INTO settings (key, value) VALUES ('documentFees', $1)`,
                [JSON.stringify(settings.documentFees || [])]
            );
            await client.query(
                `INSERT INTO settings (key, value) VALUES ('puroks', $1)`,
                [JSON.stringify(settings.puroks || [])]
            );
            console.log('  Seeded settings (documentFees + puroks)');
        }

        // -- 6. Announcements --
        const announcements = readJSON('announcements.json');
        if (announcements && announcements.length > 0) {
            for (const a of announcements) {
                await client.query(
                    `INSERT INTO announcements (id, title, content, date, date_modified)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [a.id, a.title || '', a.content || '', a.date || '', a.dateModified || '']
                );
            }
            await client.query(`SELECT setval('announcements_id_seq', (SELECT COALESCE(MAX(id),0) FROM announcements))`);
            console.log('  Seeded ' + announcements.length + ' announcements');
        } else {
            console.log('  Announcements is empty (nothing to seed)');
        }

        // -- 7. Homepage --
        const homepage = readJSON('homepage.json');
        if (homepage) {
            await client.query(
                `INSERT INTO homepage (key, value) VALUES ('content', $1)`,
                [JSON.stringify(homepage)]
            );
            console.log('  Seeded homepage content');
        }

        // Commit — all data saved!
        await client.query('COMMIT');

        console.log('\nSeed complete! All JSON data is now in PostgreSQL.\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\nSeed failed! All changes rolled back.\n');
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
