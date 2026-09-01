-- Rastreia a origem de cópias limpas sem misturar hierarquia com histórico.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS source_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS source_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_courses_source_course
  ON courses(source_course_id);

CREATE INDEX IF NOT EXISTS idx_classes_source_class
  ON classes(source_class_id);
