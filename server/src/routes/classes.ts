import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdmin, isCourseCreatorMiddleware } from '../middleware/auth.js';
import { upload, UPLOAD_DIR } from '../middleware/upload.js';

const router = Router();

async function userCanAccessCourse(courseId: string | number, userId: number, role: string): Promise<boolean> {
  if (role === 'ADMIN') return true;

  const { rows } = await pool.query(
    `SELECT 1
     FROM courses c
     LEFT JOIN course_teachers ct ON c.id = ct.course_id
     WHERE c.id = $1 AND (c.owner_id = $2 OR ct.teacher_id = $2)
     LIMIT 1`,
    [courseId, userId]
  );
  if (rows.length > 0) return true;

  const { rows: studentRows } = await pool.query(
    `SELECT 1
     FROM registrations r
     INNER JOIN app_users u ON (r.identifier = u.cpf OR r.identifier = u.email)
     WHERE r.course_id = $1 AND u.id = $2
     LIMIT 1`,
    [courseId, userId]
  );
  return studentRows.length > 0;
}

async function userCanAccessClass(classId: string, userId: number, role: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM classes cl
     JOIN courses c ON cl.course_id = c.id
     LEFT JOIN course_teachers ct ON c.id = ct.course_id
     WHERE cl.id = $1 AND ($2 = 'ADMIN' OR cl.owner_id = $3 OR cl.auxiliary_teacher_id = $3 OR c.owner_id = $3 OR ct.teacher_id = $3)
     LIMIT 1`,
    [classId, role, userId]
  );
  return rows.length > 0;
}

// GET /api/courses/:courseId/classes — Listar aulas de um curso
router.get('/course/:courseId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessCourse(req.params.courseId, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    const { rows } = await pool.query(
      'SELECT * FROM classes WHERE course_id = $1 ORDER BY created_at DESC',
      [req.params.courseId]
    );
    res.json(rows);
  } catch (err) {
    console.error('List classes error:', err);
    res.status(500).json({ error: 'Erro ao listar aulas' });
  }
});

// POST /api/classes — Criar aula
router.post('/', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { course_id, title, description, qr_duration_minutes, auxiliary_teacher_id, points_start, points_middle, points_end, type, expected_duration_minutes, slide_minimum_seconds } = req.body;

  if (!course_id || !title?.trim()) {
    res.status(400).json({ error: 'course_id e title são obrigatórios' });
    return;
  }

  try {
    const canAccess = await userCanAccessCourse(course_id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO classes (course_id, title, description, date, qr_duration_minutes, owner_id, status, auxiliary_teacher_id, points_start, points_middle, points_end, type, expected_duration_minutes, slide_minimum_seconds)
       VALUES ($1, $2, $3, NOW(), $4, $5, 'scheduled', $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        course_id, title.trim(), description?.trim() || '', qr_duration_minutes || 10, req.user!.id, auxiliary_teacher_id || null,
        points_start ?? 40, points_middle ?? 30, points_end ?? 30,
        type || 'presential', expected_duration_minutes || null, slide_minimum_seconds || 30,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create class error:', err);
    res.status(500).json({ error: 'Erro ao criar aula' });
  }
});

// GET /api/classes/:id — Detalhes da aula (público para scan pages)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM classes WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }
    const classData = rows[0];
    res.json({
      id: classData.id,
      course_id: classData.course_id,
      title: classData.title,
      description: classData.description,
      date: classData.date,
      status: classData.status,
      qr_duration_minutes: classData.qr_duration_minutes,
      qr_start_at: classData.qr_start_at,
      qr_middle_at: classData.qr_middle_at,
      qr_end_at: classData.qr_end_at,
      presentation_url: classData.presentation_url,
      points_start: classData.points_start,
      points_middle: classData.points_middle,
      points_end: classData.points_end,
      type: classData.type,
      expected_duration_minutes: classData.expected_duration_minutes,
      slide_minimum_seconds: classData.slide_minimum_seconds,
    });
  } catch (err) {
    console.error('Get class error:', err);
    res.status(500).json({ error: 'Erro ao buscar aula' });
  }
});

// PUT /api/classes/:id — Atualizar aula (status, QR timestamps)
router.put('/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, date, status, qr_duration_minutes, qr_start_at, qr_middle_at, qr_end_at, auxiliary_teacher_id, points_start, points_middle, points_end, type, expected_duration_minutes, slide_minimum_seconds } = req.body;

  try {
    const canAccess = await userCanAccessClass(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIdx = 1;

    if (title !== undefined) {
      setClauses.push(`title = $${paramIdx++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIdx++}`);
      values.push(description.trim());
    }
    if (date !== undefined) {
      setClauses.push(`date = $${paramIdx++}`);
      values.push(date);
    }
    if (status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      values.push(status);
    }
    if (qr_duration_minutes !== undefined) {
      setClauses.push(`qr_duration_minutes = $${paramIdx++}`);
      values.push(qr_duration_minutes);
    }
    if (qr_start_at !== undefined) {
      setClauses.push(`qr_start_at = $${paramIdx++}`);
      values.push(qr_start_at);
    }
    if (qr_middle_at !== undefined) {
      setClauses.push(`qr_middle_at = $${paramIdx++}`);
      values.push(qr_middle_at);
    }
    if (qr_end_at !== undefined) {
      setClauses.push(`qr_end_at = $${paramIdx++}`);
      values.push(qr_end_at);
    }
    if (auxiliary_teacher_id !== undefined) {
      setClauses.push(`auxiliary_teacher_id = $${paramIdx++}`);
      values.push(auxiliary_teacher_id);
    }
    if (points_start !== undefined) {
      setClauses.push(`points_start = $${paramIdx++}`);
      values.push(points_start);
    }
    if (points_middle !== undefined) {
      setClauses.push(`points_middle = $${paramIdx++}`);
      values.push(points_middle);
    }
    if (points_end !== undefined) {
      setClauses.push(`points_end = $${paramIdx++}`);
      values.push(points_end);
    }
    if (type !== undefined) {
      setClauses.push(`type = $${paramIdx++}`);
      values.push(type);
    }
    if (expected_duration_minutes !== undefined) {
      setClauses.push(`expected_duration_minutes = $${paramIdx++}`);
      values.push(expected_duration_minutes);
    }
    if (slide_minimum_seconds !== undefined) {
      setClauses.push(`slide_minimum_seconds = $${paramIdx++}`);
      values.push(slide_minimum_seconds);
    }

    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE classes SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx} AND ($${paramIdx + 1} = TRUE OR owner_id = $${paramIdx + 2} OR auxiliary_teacher_id = $${paramIdx + 2})
       RETURNING *`,
      [...values, isAdmin(req.user), req.user!.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Update class error:', err);
    res.status(500).json({ error: 'Erro ao atualizar aula' });
  }
});

// POST /api/classes/:id/presentation — Anexar/substituir PDF de apresentação
router.post('/:id/presentation', authMiddleware, isCourseCreatorMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessClass(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado' });
      return;
    }
    if (file.mimetype !== 'application/pdf') {
      res.status(400).json({ error: 'O arquivo de apresentação deve ser um PDF' });
      return;
    }

    const presentationUrl = `/api/uploads/${file.filename}`;
    const { rows } = await pool.query(
      'UPDATE classes SET presentation_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [presentationUrl, req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Upload presentation error:', err);
    res.status(500).json({ error: 'Erro ao enviar apresentação' });
  }
});

// DELETE /api/classes/:id/presentation — Remover PDF de apresentação
router.delete('/:id/presentation', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessClass(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const { rows } = await pool.query(
      'SELECT presentation_url FROM classes WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0 || !rows[0].presentation_url) {
      res.status(404).json({ error: 'Nenhum PDF encontrado para esta aula' });
      return;
    }

    // Remove o arquivo do disco
    const fileName = (rows[0].presentation_url as string).replace('/api/uploads/', '');
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.unlink(filePath, (err) => {
      if (err) console.error('Erro ao deletar arquivo PDF:', err);
    });

    const { rows: updated } = await pool.query(
      'UPDATE classes SET presentation_url = NULL, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Delete presentation error:', err);
    res.status(500).json({ error: 'Erro ao remover apresentação' });
  }
});

// POST /api/classes/:id/reuse — Reutilizar aula (cópia profunda)
router.post('/:id/reuse', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { course_id, title, description, date } = req.body;

  if (!course_id) {
    res.status(400).json({ error: 'course_id é obrigatório' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Busca aula original
    const orig = await client.query('SELECT * FROM classes WHERE id = $1', [req.params.id]);
    if (orig.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Aula original não encontrada' });
      return;
    }
    const original = orig.rows[0];

    // 2. Cria nova aula
    const { rows: [newClass] } = await client.query(
      `INSERT INTO classes (course_id, title, description, date, status, qr_duration_minutes, owner_id, points_start, points_middle, points_end, type, expected_duration_minutes, slide_minimum_seconds, presentation_url)
       VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        course_id,
        title?.trim() || original.title,
        description?.trim() || original.description || '',
        date || null,
        original.qr_duration_minutes || 10,
        req.user!.id,
        original.points_start ?? 40,
        original.points_middle ?? 30,
        original.points_end ?? 30,
        original.type || 'presential',
        original.expected_duration_minutes,
        original.slide_minimum_seconds,
        original.presentation_url,
      ]
    );

    // 3. Copia avaliações
    const { rows: origEvals } = await client.query(
      'SELECT * FROM evaluations WHERE class_id = $1',
      [original.id]
    );

    for (const ev of origEvals) {
      const { rows: [newEval] } = await client.query(
        `INSERT INTO evaluations (class_id, title, question_time, status, type)
         VALUES ($1, $2, $3, 'draft', $4) RETURNING *`,
        [newClass.id, ev.title, ev.question_time, ev.type || 'presential']
      );

      const { rows: origQuestions } = await client.query(
        'SELECT * FROM questions WHERE evaluation_id = $1 ORDER BY order_index',
        [ev.id]
      );

      for (const q of origQuestions) {
        const { rows: [newQ] } = await client.query(
          `INSERT INTO questions (evaluation_id, text, order_index, points)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [newEval.id, q.text, q.order_index, q.points ?? 10]
        );

        const { rows: origAlts } = await client.query(
          'SELECT * FROM alternatives WHERE question_id = $1 ORDER BY order_index',
          [q.id]
        );

        for (const alt of origAlts) {
          await client.query(
            `INSERT INTO alternatives (question_id, text, is_correct, order_index)
             VALUES ($1, $2, $3, $4)`,
            [newQ.id, alt.text, alt.is_correct, alt.order_index]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json(newClass);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reuse class error:', err);
    res.status(500).json({ error: 'Erro ao reutilizar aula' });
  } finally {
    client.release();
  }
});

// DELETE /api/classes/:id — Excluir aula (apenas se status === 'scheduled')
router.delete('/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessClass(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    // Verifica status da aula
    const checkRes = await pool.query('SELECT status FROM classes WHERE id = $1', [req.params.id]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    if (checkRes.rows[0].status !== 'scheduled') {
      res.status(403).json({ error: 'Não é possível excluir uma aula que já foi iniciada ou finalizada.' });
      return;
    }

    // Exclui a aula
    await pool.query('DELETE FROM classes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete class error:', err);
    res.status(500).json({ error: 'Erro ao excluir aula' });
  }
});

// GET /api/classes/:id/registrations — Listar cadastros da aula
router.get('/:id/registrations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessClass(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const { rows } = await pool.query(
      'SELECT * FROM registrations WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List registrations error:', err);
    res.status(500).json({ error: 'Erro ao listar cadastros' });
  }
});

// GET /api/classes/:id/attendances — Listar presenças da aula
router.get('/:id/attendances', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessClass(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const { rows: [classRow] } = await pool.query(
      'SELECT id, course_id, type FROM classes WHERE id = $1',
      [req.params.id]
    );

    if (classRow?.type === 'online') {
      const { rows } = await pool.query(
        `WITH matched_progress AS (
           SELECT DISTINCT ON (p.id)
             p.id,
             p.class_id,
             COALESCE(r.identifier, p.identifier) AS identifier,
             COALESCE(r.full_name, p.full_name) AS full_name,
             r.role,
             r.department,
             CASE WHEN p.completed_at IS NOT NULL THEN (EXTRACT(EPOCH FROM p.completed_at)::bigint * 1000) ELSE NULL END AS scan_start,
             CASE WHEN p.completed_at IS NOT NULL THEN (EXTRACT(EPOCH FROM p.completed_at)::bigint * 1000) ELSE NULL END AS scan_middle,
             CASE WHEN p.completed_at IS NOT NULL THEN (EXTRACT(EPOCH FROM p.completed_at)::bigint * 1000) ELSE NULL END AS scan_end,
             CASE WHEN p.completed_at IS NOT NULL THEN 100 ELSE NULL END AS justification,
             p.created_at,
             p.completed_at,
             p.total_time_spent_seconds,
             'online' AS source
           FROM class_online_progress p
           LEFT JOIN app_users u
             ON p.identifier = u.cpf OR p.identifier = u.email
           LEFT JOIN registrations r
             ON r.course_id = $2
            AND (
              r.identifier = p.identifier
              OR (u.cpf IS NOT NULL AND r.identifier = u.cpf)
              OR (u.email IS NOT NULL AND r.identifier = u.email)
            )
           WHERE p.class_id = $1
           ORDER BY p.id, CASE WHEN r.id IS NULL THEN 1 ELSE 0 END, r.created_at DESC
         )
         SELECT * FROM matched_progress ORDER BY created_at DESC`,
        [req.params.id, classRow.course_id]
      );
      res.json(rows);
      return;
    }

    const { rows } = await pool.query(
      'SELECT * FROM attendances WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List attendances error:', err);
    res.status(500).json({ error: 'Erro ao listar presenças' });
  }
});

// GET /api/classes/:id/evaluation-scores — Pontuação de avaliações por aluno nesta aula
router.get('/:id/evaluation-scores', async (req: Request, res: Response) => {
  try {
    const { rows: [classRow] } = await pool.query(
      'SELECT id, course_id FROM classes WHERE id = $1',
      [req.params.id]
    );

    if (!classRow) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const { rows: evaluations } = await pool.query(
      'SELECT id FROM evaluations WHERE class_id = $1',
      [req.params.id]
    );

    if (evaluations.length === 0) {
      res.json([]);
      return;
    }

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

    // Participantes com respostas e justificativas
    const { rows } = await pool.query(
      `SELECT
         ep.identifier,
         ep.name,
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
       GROUP BY ep.identifier, ep.name, ep.evaluation_id, ep.justification`,
      [evalIds]
    );

    // Aplica justificativa e agrega por identifier
    const agg = new Map<string, { name: string; total_score: number; total_possible: number }>();
    for (const r of rows) {
      const key = r.identifier;
      const maxPts = possibleByEval.get(r.evaluation_id) || 0;
      const pts = r.justification != null
        ? Math.round((maxPts * r.justification) / 100)
        : parseInt(r.total_score) || 0;
      const existing = agg.get(key) || { name: r.name, total_score: 0, total_possible: 0 };
      existing.total_score += pts;
      existing.total_possible += maxPts;
      agg.set(key, existing);
    }

    const { rows: onlineScores } = await pool.query(
      `WITH ranked AS (
         SELECT
           COALESCE(r.identifier, ep.identifier) AS identifier,
           COALESCE(r.full_name, ep.name) AS name,
           oat.evaluation_id,
           oat.total_score,
           oat.total_possible,
           ROW_NUMBER() OVER (
             PARTITION BY oat.evaluation_id, COALESCE(r.identifier, ep.identifier)
             ORDER BY oat.percentage DESC, oat.total_score DESC, oat.completed_at DESC
           ) AS rn
         FROM online_evaluation_attempts oat
         JOIN evaluation_participants ep ON ep.id = oat.participant_id
         LEFT JOIN app_users u
           ON ep.identifier = u.cpf OR ep.identifier = u.email
         LEFT JOIN registrations r
           ON r.course_id = $2
          AND (
            r.identifier = ep.identifier
            OR (u.cpf IS NOT NULL AND r.identifier = u.cpf)
            OR (u.email IS NOT NULL AND r.identifier = u.email)
          )
         WHERE oat.evaluation_id = ANY($1::int[])
           AND oat.status = 'completed'
       )
       SELECT * FROM ranked WHERE rn = 1`,
      [evalIds, classRow.course_id]
    );

    for (const r of onlineScores) {
      const key = r.identifier;
      const existing = agg.get(key) || { name: r.name, total_score: 0, total_possible: 0 };
      existing.total_score += parseInt(r.total_score) || 0;
      existing.total_possible += parseInt(r.total_possible) || (possibleByEval.get(r.evaluation_id) || 0);
      agg.set(key, existing);
    }

    res.json(Array.from(agg.entries()).map(([identifier, data]) => ({ identifier, ...data })));
  } catch (err) {
    console.error('Evaluation scores error:', err);
    res.status(500).json({ error: 'Erro ao buscar notas' });
  }
});

// PUT /api/classes/:id/attendances/justify — Justificar ausência de aluno
router.put('/:id/attendances/justify', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { identifier, justification } = req.body;
    if (!identifier || justification == null || justification < 0 || justification > 100) {
      res.status(400).json({ error: 'identifier e justification (0-100) são obrigatórios' });
      return;
    }

    const { rows: [att] } = await pool.query(
      `INSERT INTO attendances (class_id, identifier, justification)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, identifier) DO UPDATE SET justification = EXCLUDED.justification
       RETURNING *`,
      [req.params.id, identifier, justification]
    );

    // Auto-register the student in the course if not already registered
    const { rows: classRows } = await pool.query('SELECT course_id FROM classes WHERE id = $1', [req.params.id]);
    if (classRows.length > 0) {
      const courseId = classRows[0].course_id;
      
      const { rows: userRows } = await pool.query(
        'SELECT name, cargo, departamento FROM app_users WHERE matricula = $1 OR cpf = $1 OR email = $1',
        [identifier]
      );
      
      if (userRows.length > 0) {
        const user = userRows[0];
        await pool.query(
          `INSERT INTO registrations (course_id, identifier, full_name, role, department)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (course_id, identifier) DO NOTHING`,
          [courseId, identifier, user.name, user.cargo, user.departamento]
        );
      }
    }

    res.json(att);
  } catch (err) {
    console.error('Justify attendance error:', err);
    res.status(500).json({ error: 'Erro ao justificar ausência' });
  }
});

export default router;
