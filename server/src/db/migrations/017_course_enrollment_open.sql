ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS enrollment_open BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_courses_enrollment_open
  ON courses(enrollment_open)
  WHERE enrollment_open = TRUE;
