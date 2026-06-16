-- 013_online_evaluation_attempts.sql
-- Tentativas individuais para avaliações online assíncronas.

CREATE TABLE IF NOT EXISTS online_evaluation_attempts (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES evaluation_participants(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  question_started_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_score INTEGER NOT NULL DEFAULT 0,
  total_possible INTEGER NOT NULL DEFAULT 0,
  percentage INTEGER NOT NULL DEFAULT 0,
  UNIQUE (evaluation_id, participant_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS online_evaluation_attempt_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES online_evaluation_attempts(id) ON DELETE CASCADE,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  alternative_id INTEGER REFERENCES alternatives(id) ON DELETE SET NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  timed_out BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_online_attempts_evaluation_participant
  ON online_evaluation_attempts(evaluation_id, participant_id);

CREATE INDEX IF NOT EXISTS idx_online_attempt_answers_attempt
  ON online_evaluation_attempt_answers(attempt_id);
