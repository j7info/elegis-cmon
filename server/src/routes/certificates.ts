import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

async function userCanAccessCourse(courseId: string | number, userId: number, role: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM courses c
     LEFT JOIN course_teachers ct ON c.id = ct.course_id
     WHERE c.id = $1 AND ($2 = 'ADMIN' OR c.owner_id = $3 OR ct.teacher_id = $3)
     LIMIT 1`,
    [courseId, role, userId]
  );
  return rows.length > 0;
}

async function getEvaluationScoresByClass(classIds: number[]): Promise<Map<string, number>> {
  if (classIds.length === 0) return new Map();

  const { rows: evaluations } = await pool.query(
    'SELECT id, class_id FROM evaluations WHERE class_id = ANY($1::int[])',
    [classIds]
  );

  if (evaluations.length === 0) return new Map();

  const evalIds = evaluations.map((e: any) => e.id);

  // Total de pontos possíveis por avaliação
  const { rows: evalTotals } = await pool.query(
    `SELECT evaluation_id, SUM(points) AS total_possible
     FROM questions WHERE evaluation_id = ANY($1::int[])
     GROUP BY evaluation_id`,
    [evalIds]
  );
  const possibleByEval = new Map<number, number>();
  for (const et of evalTotals) {
    possibleByEval.set(et.evaluation_id, parseInt(et.total_possible));
  }

  // Participantes com suas respostas e justificativas
  const { rows: scores } = await pool.query(
    `SELECT
       ep.identifier,
       ep.evaluation_id,
       COALESCE(SUM(CASE WHEN a.is_correct THEN q.points ELSE 0 END), 0) AS total_score,
       ep.justification
     FROM evaluation_participants ep
     LEFT JOIN student_answers sa ON sa.participant_id = ep.id
     LEFT JOIN alternatives a ON sa.alternative_id = a.id
     LEFT JOIN questions q ON sa.question_id = q.id
     JOIN evaluations e ON e.id = ep.evaluation_id
     WHERE ep.evaluation_id = ANY($1::int[])
       AND e.type <> 'online'
     GROUP BY ep.identifier, ep.evaluation_id, ep.justification`,
    [evalIds]
  );

  const scoreMap = new Map<string, number>();
  for (const s of scores) {
    const maxPts = possibleByEval.get(s.evaluation_id) || 1;
    let pts: number;
    if (s.justification != null) {
      pts = Math.round((maxPts * s.justification) / 100);
    } else {
      pts = parseInt(s.total_score) || 0;
    }
    const pct = Math.round((pts / maxPts) * 100);
    const key = `${s.identifier}`;
    const current = scoreMap.get(key) || 0;
    scoreMap.set(key, current + pct);
  }

  const { rows: onlineScores } = await pool.query(
    `WITH ranked AS (
       SELECT
         COALESCE(r.identifier, ep.identifier) AS identifier,
         oat.evaluation_id,
         oat.percentage,
         ROW_NUMBER() OVER (
           PARTITION BY oat.evaluation_id, COALESCE(r.identifier, ep.identifier)
           ORDER BY oat.percentage DESC, oat.total_score DESC, oat.completed_at DESC
         ) AS rn
       FROM online_evaluation_attempts oat
       JOIN evaluation_participants ep ON ep.id = oat.participant_id
       JOIN evaluations e ON e.id = oat.evaluation_id
       JOIN classes c ON c.id = e.class_id
       LEFT JOIN app_users u
         ON ep.identifier = u.cpf OR ep.identifier = u.email
       LEFT JOIN registrations r
         ON r.course_id = c.course_id
        AND (
          r.identifier = ep.identifier
          OR (u.cpf IS NOT NULL AND r.identifier = u.cpf)
          OR (u.email IS NOT NULL AND r.identifier = u.email)
        )
       WHERE oat.evaluation_id = ANY($1::int[])
         AND oat.status = 'completed'
     )
     SELECT identifier, evaluation_id, percentage FROM ranked WHERE rn = 1`,
    [evalIds]
  );

  for (const s of onlineScores) {
    const key = `${s.identifier}`;
    const current = scoreMap.get(key) || 0;
    scoreMap.set(key, current + (parseInt(s.percentage) || 0));
  }

  return scoreMap;
}

// GET /api/courses/:courseId/certificates/report — Relatório de presença agregado
router.get('/report/:courseId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { courseId } = req.params;

  try {
    const canAccess = await userCanAccessCourse(courseId, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    // Get all classes for the course (com os pesos de pontuação por aula)
    const classesResult = await pool.query(
      'SELECT id, points_start, points_middle, points_end FROM classes WHERE course_id = $1',
      [courseId]
    );
    const classIds = classesResult.rows.map(r => r.id);

    if (classIds.length === 0) {
      res.json({ students: [], total_classes: 0 });
      return;
    }

    // Total possível = soma dos pesos (início+meio+fim) de cada aula do curso
    const totalPossiblePoints = classesResult.rows.reduce(
      (sum, c) => sum + (c.points_start ?? 40) + (c.points_middle ?? 30) + (c.points_end ?? 30),
      0
    );

    // Pontuação de avaliações
    const evalScoreMap = await getEvaluationScoresByClass(classIds);

    // Aggregate attendance across all classes usando os pesos de cada aula
    const { rows } = await pool.query(
      `WITH online_attendances AS (
        SELECT DISTINCT ON (p.id)
          p.class_id,
          COALESCE(r.identifier, p.identifier) AS identifier,
          COALESCE(r.full_name, p.full_name) AS full_name,
          r.department,
          r.role,
          CASE WHEN p.completed_at IS NOT NULL THEN (EXTRACT(EPOCH FROM p.completed_at)::bigint * 1000) ELSE NULL END AS scan_start,
          CASE WHEN p.completed_at IS NOT NULL THEN (EXTRACT(EPOCH FROM p.completed_at)::bigint * 1000) ELSE NULL END AS scan_middle,
          CASE WHEN p.completed_at IS NOT NULL THEN (EXTRACT(EPOCH FROM p.completed_at)::bigint * 1000) ELSE NULL END AS scan_end,
          CASE WHEN p.completed_at IS NOT NULL THEN 100 ELSE NULL END AS justification
        FROM class_online_progress p
        JOIN classes oc ON oc.id = p.class_id
        LEFT JOIN app_users u
          ON p.identifier = u.cpf OR p.identifier = u.email
        LEFT JOIN registrations r
          ON r.course_id = oc.course_id
         AND (
           r.identifier = p.identifier
           OR (u.cpf IS NOT NULL AND r.identifier = u.cpf)
           OR (u.email IS NOT NULL AND r.identifier = u.email)
         )
        WHERE p.class_id = ANY($1)
          AND oc.type = 'online'
        ORDER BY p.id, CASE WHEN r.id IS NULL THEN 1 ELSE 0 END, r.created_at DESC
      ),
      all_attendances AS (
        SELECT
          a.class_id,
          a.identifier,
          a.full_name,
          a.department,
          a.role,
          a.scan_start,
          a.scan_middle,
          a.scan_end,
          a.justification
        FROM attendances a
        WHERE a.class_id = ANY($1)

        UNION ALL

        SELECT * FROM online_attendances
      )
      SELECT
        a.identifier,
        MAX(a.full_name) AS full_name,
        MAX(a.department) AS department,
        MAX(a.role) AS role,
        SUM(
          CASE
            WHEN a.justification IS NOT NULL
              THEN ROUND((c.points_start + c.points_middle + c.points_end) * a.justification / 100.0)
            ELSE
              CASE WHEN a.scan_start  IS NOT NULL THEN c.points_start  ELSE 0 END +
              CASE WHEN a.scan_middle IS NOT NULL THEN c.points_middle ELSE 0 END +
              CASE WHEN a.scan_end    IS NOT NULL THEN c.points_end    ELSE 0 END
          END
        ) AS points
       FROM all_attendances a
       JOIN classes c ON a.class_id = c.id
       GROUP BY a.identifier
       ORDER BY points DESC`,
      [classIds]
    );
    const students = rows.map(s => {
      const evalPts = evalScoreMap.get(s.identifier) || 0;
      return {
        ...s,
        points: parseInt(s.points),
        evaluation_score: evalPts,
        total_score: parseInt(s.points) + evalPts,
        percentage: totalPossiblePoints > 0 ? Math.round((parseInt(s.points) / totalPossiblePoints) * 100) : 0,
        approved: totalPossiblePoints > 0 ? (parseInt(s.points) / totalPossiblePoints) * 100 >= 75 : false,
      };
    });

    res.json({ students, total_classes: classIds.length });
  } catch (err) {
    console.error('Certificate report error:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// POST /api/certificates — Emitir ou buscar certificado existente
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { course_id, student_id, student_name, course_title, points, percentage, evaluation_score } = req.body;

  if (!course_id || !student_id) {
    res.status(400).json({ error: 'course_id e student_id são obrigatórios' });
    return;
  }

  try {
    const canAccess = await userCanAccessCourse(course_id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    // Check if certificate already exists
    const existing = await pool.query(
      'SELECT * FROM certificates WHERE course_id = $1 AND student_id = $2',
      [course_id, student_id]
    );

    if (existing.rows.length > 0) {
      res.json(existing.rows[0]);
      return;
    }

    // Generate token
    const token = crypto.randomBytes(8).toString('hex').toUpperCase();

    const { rows } = await pool.query(
      `INSERT INTO certificates (course_id, student_id, student_name, course_title, points, percentage, evaluation_score, token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [course_id, student_id, student_name || 'Sem Nome', course_title || '', points || 0, percentage || 0, evaluation_score || 0, token]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create certificate error:', err);
    res.status(500).json({ error: 'Erro ao emitir certificado' });
  }
});

// GET /api/certificates/verify/:token — Verificar certificado (PÚBLICO)
router.get('/verify/:token', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM certificates WHERE token = $1',
      [req.params.token.toUpperCase()]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Certificado não encontrado ou código inválido.' });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Verify certificate error:', err);
    res.status(500).json({ error: 'Erro ao verificar certificado' });
  }
});

export default router;
