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

CREATE INDEX IF NOT EXISTS idx_rcd_manual_collection_date ON rcd_manual_collections(collection_date);
