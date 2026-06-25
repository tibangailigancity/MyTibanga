-- Resident can hide expired requests from their tracker; admin keeps them until retention purge.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS resident_hidden_at TIMESTAMPTZ DEFAULT NULL;
