CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  question_time INTEGER DEFAULT 30,
  status VARCHAR(20) DEFAULT 'draft',
  current_question INTEGER DEFAULT 0,
  phase VARCHAR(20) DEFAULT 'idle',
  phase_started_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alternatives (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluation_participants (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(evaluation_id, identifier)
);

CREATE TABLE IF NOT EXISTS student_answers (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES evaluation_participants(id) ON DELETE CASCADE,
  alternative_id INTEGER NOT NULL REFERENCES alternatives(id) ON DELETE CASCADE,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(evaluation_id, question_id, participant_id)
);
