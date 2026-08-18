-- Auditoria de presenças registradas manualmente pelo professor.

ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS manual_percentage INTEGER CHECK (manual_percentage BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS manual_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_recorded_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE class_online_progress
  ADD COLUMN IF NOT EXISTS manual_percentage INTEGER CHECK (manual_percentage BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS manual_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_recorded_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL;
