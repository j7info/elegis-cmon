-- 011_online_evaluations.sql
-- Suporte a avaliações online (assíncronas, após leitura de slides)

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'presential'
  CHECK (type IN ('presential', 'online'));
