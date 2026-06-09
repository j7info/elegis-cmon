import { Router, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdmin, isCourseCreatorMiddleware } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

async function userCanAccessCourse(courseId: string, userId: number, role: string): Promise<boolean> {
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

// GET /api/courses — Listar cursos do usuário (owner ou adicional)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.* FROM courses c 
       LEFT JOIN course_teachers ct ON c.id = ct.course_id
       WHERE c.owner_id = $1 OR ct.teacher_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user!.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List courses error:', err);
    res.status(500).json({ error: 'Erro ao listar cursos' });
  }
});

// GET /api/courses/enrolled — Listar cursos em que o usuário está matriculado (aluno)
router.get('/enrolled', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT c.*
       FROM courses c
       INNER JOIN registrations r ON r.course_id = c.id
       INNER JOIN app_users u ON u.id = $1
       WHERE r.identifier = u.cpf OR r.identifier = u.email
       ORDER BY c.created_at DESC`,
      [req.user!.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List enrolled courses error:', err);
    res.status(500).json({ error: 'Erro ao listar cursos matriculados' });
  }
});

// POST /api/courses — Criar curso
router.post('/', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, duration_hours, additional_teachers } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: 'Título é obrigatório' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO courses (title, description, duration_hours, owner_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title.trim(), description?.trim() || '', duration_hours || 0, req.user!.id]
    );
    const newCourse = rows[0];

    if (Array.isArray(additional_teachers) && additional_teachers.length > 0) {
      for (const tId of additional_teachers) {
        await client.query(
          'INSERT INTO course_teachers (course_id, teacher_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newCourse.id, tId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(newCourse);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create course error:', err);
    res.status(500).json({ error: 'Erro ao criar curso' });
  } finally {
    client.release();
  }
});

// GET /api/courses/:id — Detalhes de um curso
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessCourse(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }
    const course = rows[0];
    
    // Buscar professores adicionais
    const { rows: teachers } = await pool.query(
      `SELECT u.id, u.name, u.matricula FROM course_teachers ct
       JOIN app_users u ON ct.teacher_id = u.id
       WHERE ct.course_id = $1`,
      [course.id]
    );
    course.additional_teachers = teachers;

    res.json(course);
  } catch (err) {
    console.error('Get course error:', err);
    res.status(500).json({ error: 'Erro ao buscar curso' });
  }
});

// GET /api/courses/:id/students — Alunos definitivos do curso (inscritos)
router.get('/:id/students', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessCourse(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (identifier) identifier, full_name, role, department, created_at
       FROM registrations
       WHERE course_id = $1
       ORDER BY identifier, created_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('List course students error:', err);
    res.status(500).json({ error: 'Erro ao listar alunos do curso' });
  }
});

// GET /api/courses/:id/enrollment-link — Link de inscrição público
router.get('/:id/enrollment-link', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessCourse(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    const link = `${req.protocol}://${req.get('host')}/register/${req.params.id}`;
    res.json({ link });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar link' });
  }
});

// POST /api/courses/:id/enroll — Inscrever aluno
router.post('/:id/enroll', async (req: AuthRequest, res: Response) => {
  const { identifier } = req.body;
  if (!identifier) {
    res.status(400).json({ error: 'Identificador obrigatório' });
    return;
  }
  const clean = normalizeIdentifier(identifier);
  try {
    // 1. Busca aluno (normaliza também o valor do banco)
    const { rows: users } = await pool.query(
      `SELECT id, name, cpf, email, departamento, cargo FROM app_users
       WHERE cpf = $1 OR email = $1`,
      [clean]
    );
    if (users.length === 0) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }
    const user = users[0];

    // 2. Registra com identificador normalizado
    const storedIdentifier = normalizeIdentifier(user.cpf || user.email);
    await pool.query(
      `INSERT INTO registrations (course_id, identifier, full_name, role, department)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (course_id, identifier) DO NOTHING`,
      [req.params.id, storedIdentifier, user.name, user.cargo, user.departamento]
    );
    res.json({ message: 'Inscrito com sucesso' });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ error: 'Erro ao inscrever' });
  }
});

// PUT /api/courses/:id — Atualizar curso
router.put('/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, duration_hours, certificate_config, additional_teachers } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE courses SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        duration_hours = COALESCE($3, duration_hours),
        certificate_config = COALESCE($4, certificate_config),
        updated_at = NOW()
       WHERE id = $5 AND ($6 = TRUE OR owner_id = $7) RETURNING *`,
      [title, description, duration_hours, certificate_config ? JSON.stringify(certificate_config) : null, req.params.id, isAdmin(req.user), req.user!.id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }

    if (additional_teachers !== undefined) {
      await client.query('DELETE FROM course_teachers WHERE course_id = $1', [req.params.id]);
      if (Array.isArray(additional_teachers) && additional_teachers.length > 0) {
        for (const tId of additional_teachers) {
          await client.query(
            'INSERT INTO course_teachers (course_id, teacher_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, tId]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update course error:', err);
    res.status(500).json({ error: 'Erro ao atualizar curso' });
  } finally {
    client.release();
  }
});

// DELETE /api/courses/:id — Excluir curso
router.delete('/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
    if (rowCount === 0) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }
    res.json({ message: 'Curso excluído' });
  } catch (err) {
    console.error('Delete course error:', err);
    res.status(500).json({ error: 'Erro ao excluir curso' });
  }
});

export default router;
