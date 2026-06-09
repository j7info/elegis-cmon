-- Normaliza identificadores (CPF) removendo pontuação
-- Emails (que contêm @) são apenas lowercased

-- Função auxiliar reutilizável
CREATE OR REPLACE FUNCTION normalize_id(val TEXT) RETURNS TEXT AS $$
BEGIN
  IF val IS NULL THEN RETURN NULL; END IF;
  IF val LIKE '%@%' THEN
    RETURN LOWER(TRIM(val));
  ELSE
    RETURN regexp_replace(TRIM(val), '\D', '', 'g');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 1. registrations: remove duplicatas que virariam conflito após normalização
DELETE FROM registrations r1 USING registrations r2
WHERE r1.id < r2.id
  AND r1.course_id = r2.course_id
  AND normalize_id(r1.identifier) = normalize_id(r2.identifier);

UPDATE registrations SET identifier = normalize_id(identifier)
WHERE identifier != normalize_id(identifier);

-- 2. attendances: remove duplicatas que virariam conflito (class_id + identifier)
DELETE FROM attendances a1 USING attendances a2
WHERE a1.id < a2.id
  AND a1.class_id = a2.class_id
  AND normalize_id(a1.identifier) = normalize_id(a2.identifier);

UPDATE attendances SET identifier = normalize_id(identifier)
WHERE identifier != normalize_id(identifier);

-- 3. evaluation_participants: remove duplicatas que virariam conflito (evaluation_id + identifier)
DELETE FROM evaluation_participants e1 USING evaluation_participants e2
WHERE e1.id < e2.id
  AND e1.evaluation_id = e2.evaluation_id
  AND normalize_id(e1.identifier) = normalize_id(e2.identifier);

UPDATE evaluation_participants SET identifier = normalize_id(identifier)
WHERE identifier != normalize_id(identifier);

-- 4. app_users: normaliza CPF (não mexe em email)
UPDATE app_users SET cpf = regexp_replace(TRIM(cpf), '\D', '', 'g')
WHERE cpf IS NOT NULL AND cpf !~ '^\d+$';

DROP FUNCTION normalize_id;
