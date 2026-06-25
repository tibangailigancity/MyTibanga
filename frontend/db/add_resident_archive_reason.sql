-- Store why a resident was archived (Data Privacy Act / audit trail).
ALTER TABLE residents ADD COLUMN IF NOT EXISTS archive_reason TEXT DEFAULT '';
