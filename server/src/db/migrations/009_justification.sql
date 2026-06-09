ALTER TABLE attendances ADD COLUMN IF NOT EXISTS justification INTEGER CHECK (justification >= 0 AND justification <= 100);
ALTER TABLE evaluation_participants ADD COLUMN IF NOT EXISTS justification INTEGER CHECK (justification >= 0 AND justification <= 100);
