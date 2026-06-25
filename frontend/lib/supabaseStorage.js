import 'server-only';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BUCKET = 'documents';
const DEFAULT_SIGNED_URL_SECONDS = 600;

let storageClient = null;

function getEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not configured`);
    return value;
}

export function getStorageBucketName() {
    return process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
}

function getStorageClient() {
    if (storageClient) return storageClient;
    storageClient = createClient(
        getEnv('SUPABASE_URL'),
        getEnv('SUPABASE_SERVICE_ROLE_KEY'),
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
    return storageClient;
}

function sanitizeFilename(name) {
    return String(name || 'file')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '');
}

function getExtension(filename) {
    const base = String(filename || '').trim();
    const m = base.match(/(\.[a-zA-Z0-9]{1,8})$/);
    return m ? m[1].toLowerCase() : '';
}

function stripExtension(filename) {
    const base = String(filename || '').trim();
    return base.replace(/(\.[a-zA-Z0-9]{1,8})$/i, '');
}

/**
 * Human-readable object key: folder/{id}-{sanitizedDisplay}{extFromOriginal}
 * id keeps keys unique per DB row; display name is what you see in Storage UI.
 */
export function buildNamedStorageKey(folder, displayName, originalFilename, entityId) {
    const ext = getExtension(originalFilename);
    const base = sanitizeFilename(stripExtension(displayName || originalFilename || 'document'));
    const stem = base || 'document';
    const withExt = ext && !stem.toLowerCase().endsWith(ext.toLowerCase()) ? `${stem}${ext}` : stem;
    return `${folder}/${entityId}-${withExt}`;
}

export function isLegacyPublicPath(value) {
    return /^\/(documents|images)\//.test(String(value || ''));
}

/**
 * Map legacy DB path /images/foo.jpg → storage object key images/foo.png
 * (files live in bucket "documents" under folder images/, not a separate bucket).
 */
function contentTypeFromKey(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'application/octet-stream';
}

function previewPathBasename(previewPath) {
    const raw = String(previewPath || '').trim();
    if (!raw) return '';
    return stripExtension(path.basename(raw));
}

/** Normalize for fuzzy match: "Barangay certificate of Residency" ≈ "Certificate of Residency" */
function normalizePreviewLabel(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^barangay\s+/, '')
        .replace(/[^a-z0-9]/g, '');
}

/** Name variants (Indigency/Residency use short preview paths vs Barangay-prefixed bucket files). */
function expandDocumentNameVariants(documentName) {
    const name = String(documentName || '').trim();
    if (!name) return [];

    const variants = new Set([name]);
    const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
    variants.add(title);
    const fixedCert = name.replace(/\bcertificate\b/gi, 'Certificate');
    variants.add(fixedCert);

    if (/^barangay\s+/i.test(name)) {
        variants.add(name.replace(/^barangay\s+/i, '').trim());
    } else {
        variants.add(`Barangay ${name}`);
    }

    if (/indigency/i.test(name)) {
        variants.add('Certificate of Indigency');
        variants.add('Barangay Certificate of Indigency');
    }
    if (/residency/i.test(name)) {
        variants.add('Certificate of Residency');
        variants.add('Barangay Certificate of Residency');
        variants.add('Barangay certificate of Residency');
    }
    if (/solo\s*parent/i.test(name)) {
        variants.add('Barangay Certificate for Solo Parent');
        variants.add('Barangay Certificate for Solo Parents');
    }
    if (/motorized|banca/i.test(name)) {
        variants.add('Barangay Certificate for Motorized Banca');
    }
    if (/clearance/i.test(name)) {
        variants.add('Barangay Clearance');
    }

    return [...variants];
}

/** Possible Storage keys for a document preview (bucket folder images/). */
export function buildPreviewStorageCandidates(previewPath, documentName) {
    const keys = [];
    const add = (k) => {
        const key = String(k || '').trim();
        if (!key || isLegacyPublicPath(key) || keys.includes(key)) return;
        keys.push(key);
    };

    const raw = String(previewPath || '').trim();
    if (raw) {
        if (isLegacyPublicPath(raw)) {
            add(legacyPublicPathToStorageKey(raw));
            const clean = raw.startsWith('/') ? raw.slice(1) : raw;
            add(clean.replace(/\.jpe?g$/i, '.png'));
            add(`images/${previewPathBasename(raw)}.png`);
        } else {
            add(normalizeStorageKey(raw));
        }
    }

    for (const variant of expandDocumentNameVariants(documentName)) {
        add(`images/${variant}.png`);
        add(`images/${variant}.jpg`);
    }

    return keys;
}

/** Match a file in Storage images/ when exact keys fail (name mismatch). */
async function findPreviewInStorageListing(documentName, previewPath) {
    try {
        const client = getStorageClient();
        const bucket = getStorageBucketName();
        const { data, error } = await client.storage.from(bucket).list('images', { limit: 200 });
        if (error || !data?.length) return null;

        const needles = new Set();
        for (const variant of expandDocumentNameVariants(documentName)) {
            needles.add(normalizePreviewLabel(variant));
        }
        const base = previewPathBasename(previewPath);
        if (base) needles.add(normalizePreviewLabel(base));

        for (const file of data) {
            const fileName = String(file.name || '');
            if (!fileName || fileName.startsWith('.')) continue;
            const stem = normalizePreviewLabel(stripExtension(fileName));
            for (const needle of needles) {
                if (!needle || !stem) continue;
                if (stem === needle || stem.includes(needle) || needle.includes(stem)) {
                    const hit = await tryDownloadStorageObject(`images/${fileName}`);
                    if (hit) return hit;
                }
            }
        }
    } catch {
        return null;
    }
    return null;
}

async function tryDownloadStorageObject(objectKey) {
    const key = normalizeStorageKey(objectKey);
    if (!key || isLegacyPublicPath(key)) return null;

    try {
        const client = getStorageClient();
        const bucket = getStorageBucketName();
        const { data, error } = await client.storage.from(bucket).download(key);
        if (error || !data) return null;
        const body = Buffer.from(await data.arrayBuffer());
        return { body, contentType: contentTypeFromKey(key) };
    } catch {
        return null;
    }
}

async function tryReadPublicImageAt(publicPath) {
    const resolved = resolveLegacyPublicAsset(publicPath);
    if (!resolved || !isLegacyPublicPath(resolved)) return null;

    const clean = resolved.startsWith('/') ? resolved.slice(1) : resolved;
    const diskPath = path.join(process.cwd(), 'public', clean);
    if (!fs.existsSync(diskPath)) return null;

    try {
        const body = await fsPromises.readFile(diskPath);
        return { body, contentType: contentTypeFromKey(clean) };
    } catch {
        return null;
    }
}

async function tryReadPublicImageVariants(previewPath, documentName) {
    const paths = new Set();
    if (previewPath && isLegacyPublicPath(previewPath)) {
        paths.add(previewPath);
        paths.add(`/${legacyPublicPathToStorageKey(previewPath)}`);
    }
    for (const variant of expandDocumentNameVariants(documentName)) {
        paths.add(`/images/${variant}.png`);
        paths.add(`/images/${variant}.jpg`);
    }
    for (const rel of paths) {
        const hit = await tryReadPublicImageAt(rel);
        if (hit) return hit;
    }
    return null;
}

/**
 * Load preview bytes for <img> tags — Storage download first, then public/images/.
 */
export async function fetchPreviewImage(previewPath, documentName) {
    for (const key of buildPreviewStorageCandidates(previewPath, documentName)) {
        const fromStorage = await tryDownloadStorageObject(key);
        if (fromStorage) return fromStorage;
    }

    const listed = await findPreviewInStorageListing(documentName, previewPath);
    if (listed) return listed;

    return tryReadPublicImageVariants(previewPath, documentName);
}

export function legacyPublicPathToStorageKey(rawPath) {
    const value = String(rawPath || '').trim();
    if (!value) return '';
    if (!isLegacyPublicPath(value)) return normalizeStorageKey(value);
    const clean = value.startsWith('/') ? value.slice(1) : value;
    return clean.replace(/\.jpe?g$/i, '.png');
}

export function resolveLegacyPublicAsset(rawPath) {
    const value = String(rawPath || '').trim();
    if (!isLegacyPublicPath(value)) return value;

    const clean = value.startsWith('/') ? value.slice(1) : value;
    const exactDiskPath = path.join(process.cwd(), 'public', clean);
    if (fs.existsSync(exactDiskPath)) return value;

    // Backward-compatibility: old DB rows often store ".jpg" while public assets are ".png".
    if (/\.jpe?g$/i.test(clean)) {
        const pngRelative = clean.replace(/\.jpe?g$/i, '.png');
        const pngDiskPath = path.join(process.cwd(), 'public', pngRelative);
        if (fs.existsSync(pngDiskPath)) {
            return `/${pngRelative.replace(/\\/g, '/')}`;
        }
    }

    return value;
}

export function normalizeStorageKey(value) {
    const raw = String(value || '').trim();
    if (!raw || isLegacyPublicPath(raw)) return raw;
    return raw.replace(/^\/+/, '');
}

export function buildStorageObjectKey(folder, originalName, entityId) {
    return buildNamedStorageKey(folder, originalName, originalName, entityId);
}

export async function uploadStorageObject(objectKey, file, { upsert = true } = {}) {
    const client = getStorageClient();
    const bucket = getStorageBucketName();
    const key = normalizeStorageKey(objectKey);
    const body = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';

    const { error } = await client.storage
        .from(bucket)
        .upload(key, body, { upsert, contentType });

    if (error) throw new Error(`Upload failed for ${key}: ${error.message}`);
    return key;
}

export async function removeStorageObject(objectKey) {
    const key = normalizeStorageKey(objectKey);
    if (!key || isLegacyPublicPath(key)) return;

    const client = getStorageClient();
    const bucket = getStorageBucketName();
    const { error } = await client.storage.from(bucket).remove([key]);
    if (!error) return;

    const msg = String(error.message || '').toLowerCase();
    // Treat missing objects as success so DB cleanup can still proceed.
    if (msg.includes('not found') || msg.includes('no such') || msg.includes('does not exist')) {
        return;
    }
    throw new Error(`Delete failed for ${key}: ${error.message}`);
}

export async function tryCreateSignedStorageUrl(objectKey, expiresIn = DEFAULT_SIGNED_URL_SECONDS) {
    const key = normalizeStorageKey(objectKey);
    if (!key || isLegacyPublicPath(key)) return null;
    try {
        return await createSignedStorageUrl(key, expiresIn);
    } catch {
        return null;
    }
}

/**
 * Resolve preview: Supabase Storage (images/ in documents bucket) first, then public/.
 */
export async function resolvePreviewSource(previewPath) {
    const raw = String(previewPath || '').trim();
    if (!raw) return null;

    if (!isLegacyPublicPath(raw)) {
        const signed = await tryCreateSignedStorageUrl(raw);
        return signed ? { kind: 'redirect', url: signed } : null;
    }

    const storageKey = legacyPublicPathToStorageKey(raw);
    const signed = await tryCreateSignedStorageUrl(storageKey);
    if (signed) return { kind: 'redirect', url: signed };

    return { kind: 'public', path: resolveLegacyPublicAsset(raw) };
}

export async function createSignedStorageUrl(objectKey, expiresIn = DEFAULT_SIGNED_URL_SECONDS) {
    const key = normalizeStorageKey(objectKey);
    if (!key || isLegacyPublicPath(key)) return key;

    const client = getStorageClient();
    const bucket = getStorageBucketName();
    const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(key, expiresIn);

    if (error) throw new Error(`Signed URL failed for ${key}: ${error.message}`);
    return data?.signedUrl || '';
}

export async function resolveAssetUrl(value, expiresIn = DEFAULT_SIGNED_URL_SECONDS) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (isLegacyPublicPath(raw)) return resolveLegacyPublicAsset(raw);
    return createSignedStorageUrl(raw, expiresIn);
}
