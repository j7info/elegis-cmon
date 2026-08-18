-- Marca cursos que realmente fazem parte de uma trilha/curso pai.
-- parent_course_id ja existia para cursos reaproveitados; por isso a flag
-- evita tratar copias antigas como subcursos automaticamente.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS is_subcourse BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_courses_parent_subcourse
  ON courses(parent_course_id, is_subcourse);
