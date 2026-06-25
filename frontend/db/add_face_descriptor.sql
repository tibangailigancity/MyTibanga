-- Add face_descriptor column for face recognition login (admins only)
ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor JSONB DEFAULT NULL;
