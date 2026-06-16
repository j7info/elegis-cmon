-- 014_backfill_online_evaluation_attempts.sql
-- Converte respostas online antigas (student_answers) em tentativas concluídas.

INSERT INTO online_evaluation_attempts (
  evaluation_id,
  participant_id,
  attempt_number,
  status,
  current_question_index,
  question_started_at,
  started_at,
  completed_at,
  total_score,
  total_possible,
  percentage
)
SELECT
  ep.evaluation_id,
  ep.id,
  1,
  'completed',
  COUNT(DISTINCT q.id)::int,
  MIN(sa.answered_at),
  MIN(ep.joined_at),
  MAX(sa.answered_at),
  COALESCE(SUM(CASE WHEN a.is_correct THEN q.points ELSE 0 END), 0)::int AS total_score,
  COALESCE(possible.total_possible, 0)::int AS total_possible,
  CASE
    WHEN COALESCE(possible.total_possible, 0) > 0
      THEN ROUND((COALESCE(SUM(CASE WHEN a.is_correct THEN q.points ELSE 0 END), 0)::numeric / possible.total_possible) * 100)::int
    ELSE 0
  END AS percentage
FROM evaluation_participants ep
JOIN evaluations e ON e.id = ep.evaluation_id
JOIN student_answers sa ON sa.participant_id = ep.id AND sa.evaluation_id = ep.evaluation_id
JOIN questions q ON q.id = sa.question_id
LEFT JOIN alternatives a ON a.id = sa.alternative_id
JOIN (
  SELECT evaluation_id, SUM(points)::int AS total_possible
  FROM questions
  GROUP BY evaluation_id
) possible ON possible.evaluation_id = ep.evaluation_id
WHERE e.type = 'online'
  AND NOT EXISTS (
    SELECT 1
    FROM online_evaluation_attempts existing
    WHERE existing.evaluation_id = ep.evaluation_id
      AND existing.participant_id = ep.id
  )
GROUP BY ep.evaluation_id, ep.id, possible.total_possible
ON CONFLICT (evaluation_id, participant_id, attempt_number) DO NOTHING;

INSERT INTO online_evaluation_attempt_answers (
  attempt_id,
  evaluation_id,
  question_id,
  alternative_id,
  is_correct,
  points_awarded,
  timed_out,
  answered_at
)
SELECT
  oat.id,
  sa.evaluation_id,
  sa.question_id,
  sa.alternative_id,
  COALESCE(a.is_correct, FALSE),
  CASE WHEN a.is_correct THEN q.points ELSE 0 END,
  FALSE,
  sa.answered_at
FROM online_evaluation_attempts oat
JOIN evaluation_participants ep ON ep.id = oat.participant_id
JOIN evaluations e ON e.id = oat.evaluation_id AND e.type = 'online'
JOIN student_answers sa ON sa.participant_id = ep.id AND sa.evaluation_id = oat.evaluation_id
JOIN questions q ON q.id = sa.question_id
LEFT JOIN alternatives a ON a.id = sa.alternative_id
WHERE oat.attempt_number = 1
ON CONFLICT (attempt_id, question_id) DO NOTHING;
