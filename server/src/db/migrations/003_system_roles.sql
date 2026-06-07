-- Migration 003: System Roles and Password Reset
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS system_role VARCHAR(20) DEFAULT 'ALUNO' CHECK (system_role IN ('ADMIN', 'COORDENADOR', 'PROFESSOR', 'ALUNO'));
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS reset_token_expires BIGINT;

-- Garantir que CMON10010 seja sempre ADMIN
UPDATE app_users SET system_role = 'ADMIN' WHERE matricula = 'CMON10010';
