-- Soft-delete support for residents.
ALTER TABLE residents
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Optional index for queries that fetch active residents only.
CREATE INDEX IF NOT EXISTS idx_residents_deleted_at ON residents(deleted_at);
