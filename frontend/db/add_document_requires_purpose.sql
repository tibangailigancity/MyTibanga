-- Per-template flag: certificate has a blank purpose line to fill when printing.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS requires_purpose BOOLEAN NOT NULL DEFAULT FALSE;

-- Default the three current certificates that include a purpose line.
UPDATE documents
SET requires_purpose = TRUE
WHERE name ILIKE '%clearance%'
   OR name ILIKE '%indigency%'
   OR name ILIKE '%residency%';
