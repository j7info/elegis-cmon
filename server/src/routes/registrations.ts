import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';

const router = Router();

// POST /api/classes/:classId/registrations — Cadastro prévio de aluno (rota PÚBLICA)
router.post('/:classId/registrations', async (req: Request, res: Response) => {
  const { classId } = req.params;
  const { identifier, full_name, role, department } = req.body;

  if (!identifier?.trim() || !full_name?.trim() || !role?.trim() || !department?.trim()) {
    res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    return;
  }

  const cleanIdentifier = identifier.trim().toLowerCase();

  try {
    // Get class to find course_id
    const classResult = await pool.query('SELECT course_id FROM classes WHERE id = $1', [classId]);
    if (classResult.rows.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const courseId = classResult.rows[0].course_id;

    // Inscrição é em nível de CURSO: o aluno passa a ser aluno definitivo do
    // curso. Em aulas seguintes ele apenas reafirma presença (scan), sem se
    // recadastrar. Por isso o conflito é resolvido por (course_id, identifier).
    const { rows } = await pool.query(
      `INSERT INTO registrations (class_id, course_id, identifier, full_name, role, department)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (course_id, identifier) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         department = EXCLUDED.department
       RETURNING *`,
      [classId, courseId, cleanIdentifier, full_name.trim(), role.trim(), department.trim()]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Erro ao realizar cadastro' });
  }
});

export default router;
