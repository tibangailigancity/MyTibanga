-- One-time migration: add per-child ages (parallel to residents.children)
ALTER TABLE residents ADD COLUMN IF NOT EXISTS children_ages TEXT[] DEFAULT '{}';
