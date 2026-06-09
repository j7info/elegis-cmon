import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdmin, isCourseCreatorMiddleware } from '../middleware/auth.js';
import { upload, UPLOAD_DIR } from '../middleware/upload.js';

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
  const { course_id, title, description, qr_duration_minutes, auxiliary_teacher_id, points_start, points_middle, points_end } = req.body;

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
      `INSERT INTO classes (course_id, title, description, date, qr_duration_minutes, owner_id, status, auxiliary_teacher_id, points_start, points_middle, points_end)
       VALUES ($1, $2, $3, NOW(), $4, $5, 'scheduled', $6, $7, $8, $9) RETURNING *`,
      [
        course_id, title.trim(), description?.trim() || '', qr_duration_minutes || 10, req.user!.id, auxiliary_teacher_id || null,
        points_start ?? 40, points_middle ?? 30, points_end ?? 30,
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
    });
  } catch (err) {
    console.error('Get class error:', err);
    res.status(500).json({ error: 'Erro ao buscar aula' });
  }
});

// PUT /api/classes/:id — Atualizar aula (status, QR timestamps)
router.put('/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, date, status, qr_duration_minutes, qr_start_at, qr_middle_at, qr_end_at, auxiliary_teacher_id, points_start, points_middle, points_end } = req.body;

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
    const { rows: evaluations } = await pool.query(
      'SELECT id FROM evaluations WHERE class_id = $1',
      [req.params.id]
    );

    if (evaluations.length === 0) {
      res.json([]);
      return;
    }

    const evalIds = evaluations.map((e: any) => e.id);

    const { rows } = await pool.query(
      `SELECT
         ep.identifier,
         ep.name,
         SUM(CASE WHEN a.is_correct THEN q.points ELSE 0 END) AS total_score,
         SUM(q.points) AS total_possible
       FROM student_answers sa
       JOIN evaluation_participants ep ON sa.participant_id = ep.id
       JOIN alternatives a ON sa.alternative_id = a.id
       JOIN questions q ON sa.question_id = q.id
       WHERE sa.evaluation_id = ANY($1::int[])
       GROUP BY ep.identifier, ep.name`,
      [evalIds]
    );

    res.json(rows);
  } catch (err) {
    console.error('Evaluation scores error:', err);
    res.status(500).json({ error: 'Erro ao buscar notas' });
  }
});

export default router;
