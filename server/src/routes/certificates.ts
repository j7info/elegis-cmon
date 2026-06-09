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

  const { rows: scores } = await pool.query(
    `SELECT
       ep.identifier,
       sa.evaluation_id,
       SUM(CASE WHEN a.is_correct THEN q.points ELSE 0 END) AS total_score,
       SUM(q.points) AS total_possible
     FROM student_answers sa
     JOIN evaluation_participants ep ON sa.participant_id = ep.id
     JOIN alternatives a ON sa.alternative_id = a.id
     JOIN questions q ON sa.question_id = q.id
     WHERE sa.evaluation_id = ANY($1::int[])
     GROUP BY ep.identifier, sa.evaluation_id`,
    [evalIds]
  );

  const scoreMap = new Map<string, number>();
  for (const s of scores) {
    const pts = parseInt(s.total_score) || 0;
    const maxPts = parseInt(s.total_possible) || 1;
    const pct = Math.round((pts / maxPts) * 100);
    const key = `${s.identifier}`;
    const current = scoreMap.get(key) || 0;
    scoreMap.set(key, current + pct);
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
      `SELECT
        a.identifier,
        a.full_name,
        a.department,
        a.role,
        SUM(CASE WHEN a.scan_start  IS NOT NULL THEN c.points_start  ELSE 0 END) +
        SUM(CASE WHEN a.scan_middle IS NOT NULL THEN c.points_middle ELSE 0 END) +
        SUM(CASE WHEN a.scan_end    IS NOT NULL THEN c.points_end    ELSE 0 END) AS points
       FROM attendances a
       JOIN classes c ON a.class_id = c.id
       WHERE a.class_id = ANY($1)
       GROUP BY a.identifier, a.full_name, a.department, a.role
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
