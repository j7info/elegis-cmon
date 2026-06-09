-- 010_online_classes.sql
-- Suporte a aulas online: presença por tempo de leitura de slides

ALTER TABLE classes ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'presential'
  CHECK (type IN ('presential', 'online'));

ALTER TABLE classes ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS slide_minimum_seconds INTEGER DEFAULT 30;

CREATE TABLE IF NOT EXISTS class_online_progress (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  identifier VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  current_slide INTEGER NOT NULL DEFAULT 0,
  slide_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, identifier)
);
