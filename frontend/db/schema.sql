-- ==========================================================
-- Barangay Profiling System — Database Schema
-- ==========================================================
-- This file creates all the tables we need.
-- Run it with:  psql -U postgres -d barangay -f db/schema.sql
--
-- Structural changes from db/*.sql migrations are merged here.
-- Data-only migrations (run separately on existing DBs if needed):
--   update_puroks.sql — refreshes settings.puroks list
--   add_document_requires_purpose.sql — UPDATE flags on existing documents rows
--   add_or_booklet_setting.sql — orBooklet lives in settings (no DDL)
--   remove_family_links.sql — family_links table removed (not created here)
-- ==========================================================

-- ── Users (admins & residents who can log in) ────────────
-- Replaces: data/users.json
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,      -- auto-incrementing ID
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE,     -- must be unique
    email         TEXT DEFAULT '',
    password      TEXT NOT NULL,            -- bcrypt hash
    role          TEXT NOT NULL DEFAULT 'resident',  -- 'admin' or 'resident'
    super_admin   BOOLEAN DEFAULT FALSE,
    mobile_number TEXT DEFAULT '',             -- Philippine mobile number (e.g. 09171234567)
    permissions   TEXT[] DEFAULT '{}',      -- array of strings like {'fees','puroks'}
    face_descriptor JSONB DEFAULT NULL,      -- 128-float array for face recognition (admins only)
    must_change_password BOOLEAN DEFAULT FALSE  -- residents: force password change on first login
);

-- ── Residents (full profile records) ─────────────────────
-- Replaces: data/residents.json
CREATE TABLE IF NOT EXISTS residents (
    id                   SERIAL PRIMARY KEY,
    first_name           TEXT NOT NULL,
    middle_name          TEXT DEFAULT '',
    last_name            TEXT NOT NULL,
    suffix               TEXT DEFAULT '',
    sex                  TEXT DEFAULT '',
    civil_status         TEXT DEFAULT '',
    birthdate            TEXT DEFAULT '',
    birthplace           TEXT DEFAULT '',
    religion             TEXT DEFAULT '',
    household            TEXT DEFAULT '',
    housing_status       TEXT DEFAULT '',
    sector               TEXT DEFAULT '',
    solo_parent          BOOLEAN DEFAULT FALSE,
    citizenship          TEXT DEFAULT '',
    purok                TEXT DEFAULT '',
    barangay             TEXT DEFAULT 'Tibanga',
    city                 TEXT DEFAULT 'Iligan City',
    mobile_number        TEXT DEFAULT '',
    email                TEXT DEFAULT '',
    mothers_maiden_name  TEXT DEFAULT '',
    fathers_name         TEXT DEFAULT '',
    spouses_name         TEXT DEFAULT '',
    mother_deceased      BOOLEAN DEFAULT FALSE,
    father_deceased      BOOLEAN DEFAULT FALSE,
    spouse_deceased      BOOLEAN DEFAULT FALSE,
    childs_name          TEXT DEFAULT '',
    childs_mother        TEXT DEFAULT '',
    children             TEXT[] DEFAULT '{}',
    children_ages        TEXT[] DEFAULT '{}',   -- parallel to children (age per child; may be empty strings)
    username             TEXT DEFAULT '',
    password             TEXT DEFAULT '',
    id_picture           TEXT DEFAULT '',   -- base64-encoded image (can be very long)
    deleted_at           TIMESTAMPTZ DEFAULT NULL,
    archive_reason       TEXT DEFAULT ''    -- why record was archived (Data Privacy Act)
);

-- ── Requests (document requests from residents) ──────────
-- Replaces: data/requests.json (top-level fields)
CREATE TABLE IF NOT EXISTS requests (
    id                BIGSERIAL PRIMARY KEY,       -- BIGSERIAL because IDs are timestamps
    request_no        TEXT NOT NULL,
    resident_name     TEXT NOT NULL,
    user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- who placed it (residents); NULL = legacy / guest
    total_amount      NUMERIC(10,2) DEFAULT 0,
    date              TEXT DEFAULT '',
    status            TEXT DEFAULT 'pending',     -- pending, approved, for_release, completed, expired
    payment_method    TEXT DEFAULT 'cash',
    reference_no      TEXT DEFAULT '',
    or_number         TEXT DEFAULT '',
    rejection_reason  TEXT DEFAULT '',
    admin_notes       TEXT DEFAULT '',
    purpose           TEXT DEFAULT '',
    expired_at        TIMESTAMPTZ DEFAULT NULL,
    resident_hidden_at TIMESTAMPTZ DEFAULT NULL   -- set when resident dismisses expired request from tracker
);

-- ── Request Documents (items inside each request) ────────
-- Replaces: the "documents" array nested inside each request
-- Each row is one document line-item that belongs to a request.
CREATE TABLE IF NOT EXISTS request_documents (
    id          BIGSERIAL PRIMARY KEY,
    request_id  BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    quantity    INTEGER DEFAULT 1,
    unit_price  NUMERIC(10,2) DEFAULT 0,
    total       NUMERIC(10,2) DEFAULT 0
);

-- ── Documents (template files the admin uploads) ─────────
-- Replaces: data/documents.json
CREATE TABLE IF NOT EXISTS documents (
    id             BIGSERIAL PRIMARY KEY,  -- BIGSERIAL because IDs are timestamps
    name           TEXT NOT NULL,
    preview        TEXT DEFAULT '',   -- path to preview image
    file           TEXT DEFAULT '',   -- path to the document file
    date_modified     TEXT DEFAULT '',
    date_uploaded     TEXT DEFAULT '',
    requires_purpose  BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Settings (key-value store for system config) ─────────
-- Replaces: data/settings.json
-- We store the documentFees array and puroks array as JSONB.
-- JSONB = JSON stored in a binary format — PostgreSQL can search inside it.
CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  JSONB NOT NULL DEFAULT '[]'
);

-- ── Announcements ────────────────────────────────────────
-- Replaces: data/announcements.json
CREATE TABLE IF NOT EXISTS announcements (
    id             SERIAL PRIMARY KEY,
    title          TEXT DEFAULT '',
    content        TEXT DEFAULT '',
    date           TEXT DEFAULT '',
    date_modified  TEXT DEFAULT ''
);

-- ── Homepage Content ─────────────────────────────────────
-- Replaces: data/homepage.json
-- Single-row table, the whole homepage JSON is stored in `value`.
CREATE TABLE IF NOT EXISTS homepage (
    key    TEXT PRIMARY KEY,
    value  JSONB NOT NULL DEFAULT '{}'
);

-- ── RCD manual collections (non-portal / walk-in services) ──
CREATE TABLE IF NOT EXISTS rcd_manual_collections (
    id               BIGSERIAL PRIMARY KEY,
    collection_date  DATE NOT NULL,
    or_number        TEXT NOT NULL DEFAULT '',
    payor            TEXT NOT NULL DEFAULT '',
    collection_name  TEXT NOT NULL DEFAULT '',
    amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
    doc_stamp        NUMERIC(10,2) DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ── Indexes (from incremental migrations) ────────────────
CREATE INDEX IF NOT EXISTS idx_residents_deleted_at ON residents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_rcd_manual_collection_date ON rcd_manual_collections(collection_date);

