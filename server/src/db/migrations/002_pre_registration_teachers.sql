-- Migration 002: Pre-registration and Teachers

-- 1. app_users: Alter matricula to be nullable and add is_pre_registered
ALTER TABLE app_users ALTER COLUMN matricula DROP NOT NULL;
ALTER TABLE app_users ADD COLUMN is_pre_registered BOOLEAN DEFAULT FALSE;

-- 2. courses: Note: owner_id is already there, we use it as main_teacher_id in the code.
-- 3. course_teachers: For additional teachers
CREATE TABLE IF NOT EXISTS course_teachers (
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, teacher_id)
);

-- 4. classes: Add auxiliary_teacher_id
ALTER TABLE classes ADD COLUMN auxiliary_teacher_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL;

-- 5. registrations: Add unique constraint for course enrollment
ALTER TABLE registrations ADD CONSTRAINT unique_course_identifier UNIQUE (course_id, identifier);
