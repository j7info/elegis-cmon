import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdmin, isCourseCreatorMiddleware } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

async function userCanAccessCourse(courseId: string, userId: number, role: string): Promise<boolean> {
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
  const { title, description, duration_hours, additional_teachers, start_date, end_date } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: 'Título é obrigatório' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO courses (title, description, duration_hours, owner_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title.trim(), description?.trim() || '', duration_hours || 0, req.user!.id, start_date || null, end_date || null]
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
// GET /api/courses/:id/pending-registrations
router.get('/:id/pending-registrations', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const hasAccess = await userCanAccessCourse(id, req.user!.id, req.user!.system_role);
    if (!hasAccess) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, identifier, full_name, role, department, created_at
       FROM registrations
       WHERE course_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching pending registrations:', err);
    res.status(500).json({ error: 'Erro ao buscar inscritos pendentes' });
  }
});

// POST /api/courses/:id/approve-registration/:registrationId
router.post('/:id/approve-registration/:registrationId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id, registrationId } = req.params;
  const { matricula, full_name, identifier, email, role, department } = req.body;
  const matriculaClean = matricula?.trim() ? String(matricula).trim().toUpperCase() : null;

  if (matriculaClean && !/^[A-Z]{4}\d{5}$/.test(matriculaClean)) {
    res.status(400).json({ error: 'Matrícula deve estar no formato LLLLNNNNN (4 letras + 5 números)' });
    return;
  }

  try {
    const hasAccess = await userCanAccessCourse(id, req.user!.id, req.user!.system_role);
    if (!hasAccess) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update registration with the potentially edited data
      const { rows } = await client.query(
        `UPDATE registrations 
         SET status = $1, full_name = $2, role = $3, department = $4
         WHERE id = $5 AND course_id = $6 RETURNING *`,
        ['approved', full_name || null, role || null, department || null, registrationId, id]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Inscrição não encontrada' });
        await client.query('ROLLBACK');
        return;
      }

      const reg = rows[0];
      const finalIdentifier = normalizeIdentifier(identifier || reg.identifier);
      const emailClean = email?.trim() || (finalIdentifier.includes('@') ? finalIdentifier : null);
      const cpfClean = finalIdentifier.includes('@') ? null : finalIdentifier;

      if (matriculaClean) {
        const { rows: matriculaConflict } = await client.query(
          `SELECT id FROM app_users
           WHERE matricula = $1
             AND NOT (
               ($2::text IS NOT NULL AND cpf = $2)
               OR ($3::text IS NOT NULL AND email = $3)
             )
           LIMIT 1`,
          [matriculaClean, cpfClean, emailClean]
        );

        if (matriculaConflict.length > 0) {
          await client.query('ROLLBACK');
          res.status(409).json({ error: 'Matrícula já cadastrada para outro usuário' });
          return;
        }
      }

      const { rows: existingUsers } = await client.query(
        `SELECT * FROM app_users
         WHERE ($1::text IS NOT NULL AND cpf = $1)
            OR ($2::text IS NOT NULL AND email = $2)
            OR ($3::text IS NOT NULL AND matricula = $3)
         ORDER BY is_pre_registered DESC, id
         LIMIT 1`,
        [cpfClean, emailClean, matriculaClean]
      );

      if (existingUsers.length === 0) {
        const rawPassword = matriculaClean || finalIdentifier;
        const defaultPassword = String(rawPassword).toLowerCase().replace(/[^a-z0-9]/g, '');
        const passwordHash = await bcrypt.hash(defaultPassword || '123456', 12);

        await client.query(
          `INSERT INTO app_users
             (matricula, password_hash, name, cpf, email, cargo, departamento, status, is_pre_registered, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Ativo', FALSE, TRUE)`,
          [
            matriculaClean,
            passwordHash,
            full_name || reg.full_name,
            cpfClean,
            emailClean,
            role || reg.role,
            department || reg.department,
          ]
        );

        await client.query('COMMIT');
        res.json({ message: 'Aprovado e usuário criado', registration: reg });
      } else {
        const existing = existingUsers[0];

        if (matriculaClean && existing.matricula && existing.matricula !== matriculaClean) {
          await client.query('ROLLBACK');
          res.status(409).json({ error: 'Este aluno já possui outra matrícula cadastrada' });
          return;
        }

        await client.query(
          `UPDATE app_users SET
             matricula = COALESCE(matricula, $1),
             name = COALESCE($2, name),
             cpf = COALESCE(cpf, $3),
             email = COALESCE(email, $4),
             cargo = COALESCE($5, cargo),
             departamento = COALESCE($6, departamento),
             status = 'Ativo',
             is_pre_registered = FALSE,
             updated_at = NOW()
           WHERE id = $7`,
          [
            matriculaClean,
            full_name || reg.full_name,
            cpfClean,
            emailClean,
            role || reg.role,
            department || reg.department,
            existing.id,
          ]
        );

        await client.query('COMMIT');
        res.json({ message: 'Aprovado com sucesso', registration: reg });
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error approving registration:', err);
    res.status(500).json({ error: 'Erro ao aprovar inscrição' });
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
  const { title, description, duration_hours, certificate_config, additional_teachers, start_date, end_date } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE courses SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        duration_hours = COALESCE($3, duration_hours),
        certificate_config = COALESCE($4, certificate_config),
        start_date = COALESCE($5, start_date),
        end_date = COALESCE($6, end_date),
        updated_at = NOW()
       WHERE id = $7 AND ($8 = TRUE OR owner_id = $9) RETURNING *`,
      [title, description, duration_hours, certificate_config ? JSON.stringify(certificate_config) : null, start_date, end_date, req.params.id, isAdmin(req.user), req.user!.id]
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

// POST /api/courses/:id/reuse — Reutilizar curso (cópia profunda)
router.post('/:id/reuse', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, start_date, end_date, duration_hours } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: 'Título é obrigatório' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Busca curso original
    const orig = await client.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (orig.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Curso original não encontrado' });
      return;
    }
    const original = orig.rows[0];

    // 2. Cria novo curso
    const { rows: [newCourse] } = await client.query(
      `INSERT INTO courses (title, description, duration_hours, owner_id, certificate_config, start_date, end_date, parent_course_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title.trim(),
        description?.trim() || original.description || '',
        duration_hours || original.duration_hours || 0,
        req.user!.id,
        original.certificate_config,
        start_date || null,
        end_date || null,
        original.id,
      ]
    );

    // 3. Copia professores adicionais
    const { rows: origTeachers } = await client.query(
      'SELECT teacher_id FROM course_teachers WHERE course_id = $1',
      [original.id]
    );
    for (const t of origTeachers) {
      await client.query(
        'INSERT INTO course_teachers (course_id, teacher_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newCourse.id, t.teacher_id]
      );
    }

    // 4. Copia aulas
    const { rows: origClasses } = await client.query(
      'SELECT * FROM classes WHERE course_id = $1 ORDER BY created_at',
      [original.id]
    );

    for (const c of origClasses) {
      const { rows: [newClass] } = await client.query(
        `INSERT INTO classes (course_id, title, description, status, qr_duration_minutes, owner_id, points_start, points_middle, points_end, type, expected_duration_minutes, slide_minimum_seconds, presentation_url)
         VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          newCourse.id, c.title, c.description, c.qr_duration_minutes || 10,
          req.user!.id, c.points_start ?? 40, c.points_middle ?? 30, c.points_end ?? 30,
          c.type || 'presential', c.expected_duration_minutes, c.slide_minimum_seconds,
          c.presentation_url,
        ]
      );

      // 5. Copia avaliações da aula
      const { rows: origEvals } = await client.query(
        'SELECT * FROM evaluations WHERE class_id = $1',
        [c.id]
      );

      for (const ev of origEvals) {
        const { rows: [newEval] } = await client.query(
          `INSERT INTO evaluations (class_id, title, question_time, status, type)
           VALUES ($1, $2, $3, 'draft', $4) RETURNING *`,
          [newClass.id, ev.title, ev.question_time, ev.type || 'presential']
        );

        // 6. Copia questões e alternativas
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
    }

    await client.query('COMMIT');
    res.status(201).json(newCourse);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reuse course error:', err);
    res.status(500).json({ error: 'Erro ao reutilizar curso' });
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
