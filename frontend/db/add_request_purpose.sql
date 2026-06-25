-- Purpose of request (e.g. employment, scholarship) for certificate printing.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT '';
