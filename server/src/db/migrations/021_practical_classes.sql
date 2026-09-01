-- 021_practical_classes.sql
-- Aula prática presencial, sem apresentação, com chamadas de entrada e saída.

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_type_check;
ALTER TABLE classes ADD CONSTRAINT classes_type_check
  CHECK (type IN ('presential', 'online', 'practical'));

