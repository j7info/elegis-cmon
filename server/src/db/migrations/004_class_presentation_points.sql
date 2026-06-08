-- Migration 004: PDF de apresentação salvo + pontuação configurável por aula
ALTER TABLE classes ADD COLUMN IF NOT EXISTS presentation_url VARCHAR(500);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS points_start  INTEGER DEFAULT 40;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS points_middle INTEGER DEFAULT 30;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS points_end    INTEGER DEFAULT 30;
