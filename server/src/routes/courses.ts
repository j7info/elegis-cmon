import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdmin, isCourseCreatorMiddleware, JWT_SECRET } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';
import jwt from 'jsonwebtoken';

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
     INNER JOIN app_users u ON (r.identifier = u.cpf OR r.identifier = u.email OR r.identifier = u.matricula)
     WHERE r.course_id = $1 AND u.id = $2
     LIMIT 1`,
    [courseId, userId]
  );
  return studentRows.length > 0;
}

function studentIdentifiersCondition(alias: string) {
  return `(${alias}.identifier = u.cpf OR ${alias}.identifier = u.email OR ${alias}.identifier = u.matricula OR ${alias}.identifier = regexp_replace(COALESCE(u.matricula, ''), '\\D', '', 'g'))`;
}

function getOptionalUserId(req: AuthRequest): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as any;
    return decoded?.id ? Number(decoded.id) : null;
  } catch {
    return null;
  }
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
      `SELECT DISTINCT
         c.*,
         CASE WHEN r.id IS NULL THEN 'available' ELSE 'enrolled' END AS enrollment_status,
         r.status AS registration_status,
         r.created_at AS registered_at,
         COALESCE(pending.pending_class_count, 0)::int AS pending_class_count,
         COALESCE(pending.pending_online_count, 0)::int AS pending_online_count,
         COALESCE(pending.pending_presential_count, 0)::int AS pending_presential_count,
         pending.latest_pending_class
       FROM courses c
       INNER JOIN app_users u ON u.id = $1
       LEFT JOIN registrations r
         ON r.course_id = c.id
        AND ${studentIdentifiersCondition('r')}
       LEFT JOIN LATERAL (
         WITH pending_classes AS (
           SELECT cl.id, cl.title, cl.date, cl.type, cl.online_content_type, cl.status
           FROM classes cl
           LEFT JOIN LATERAL (
             SELECT *
             FROM attendances a
             WHERE a.class_id = cl.id
               AND (a.identifier = u.cpf OR a.identifier = u.email OR a.identifier = u.matricula)
             ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
             LIMIT 1
           ) a ON cl.type <> 'online'
           LEFT JOIN LATERAL (
             SELECT *
             FROM class_online_progress op
             WHERE op.class_id = cl.id
               AND (op.identifier = u.cpf OR op.identifier = u.email OR op.identifier = u.matricula)
             ORDER BY op.completed_at DESC NULLS LAST, op.created_at DESC
             LIMIT 1
           ) op ON cl.type = 'online'
           WHERE cl.course_id = c.id
             AND cl.status IN ('scheduled', 'active')
             AND (
               (cl.type = 'online' AND op.completed_at IS NULL)
               OR (
                 cl.type <> 'online'
                 AND (
                   a.id IS NULL
                   OR (a.scan_start IS NULL AND a.scan_middle IS NULL AND a.scan_end IS NULL AND a.justification IS NULL)
                 )
               )
             )
         )
         SELECT
           COUNT(*)::int AS pending_class_count,
           COUNT(*) FILTER (WHERE type = 'online')::int AS pending_online_count,
           COUNT(*) FILTER (WHERE type <> 'online')::int AS pending_presential_count,
           (
             SELECT jsonb_build_object(
               'id', pc.id,
               'title', pc.title,
               'date', pc.date,
               'type', pc.type,
               'online_content_type', pc.online_content_type,
               'status', pc.status
             )
             FROM pending_classes pc
             ORDER BY pc.date DESC NULLS LAST, pc.id DESC
             LIMIT 1
           ) AS latest_pending_class
         FROM pending_classes
       ) pending ON r.id IS NOT NULL
       WHERE r.id IS NOT NULL OR c.enrollment_open = TRUE
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
  const { title, description, duration_hours, additional_teachers, start_date, end_date, enrollment_open } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: 'Título é obrigatório' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO courses (title, description, duration_hours, owner_id, start_date, end_date, enrollment_open)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title.trim(), description?.trim() || '', duration_hours || 0, req.user!.id, start_date || null, end_date || null, enrollment_open !== false]
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

      const { rows } = await client.query(
        `SELECT *
         FROM registrations
         WHERE id = $1 AND course_id = $2
         FOR UPDATE`,
        [registrationId, id]
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

      const { rows: usersByMatricula } = matriculaClean
        ? await client.query('SELECT * FROM app_users WHERE matricula = $1 LIMIT 1', [matriculaClean])
        : { rows: [] };

      const { rows: existingUsers } = await client.query(
        `SELECT * FROM app_users
         WHERE ($1::text IS NOT NULL AND cpf = $1)
            OR ($2::text IS NOT NULL AND email = $2)
            OR ($3::text IS NOT NULL AND matricula = $3)
         ORDER BY is_pre_registered DESC, id
         LIMIT 1`,
        [cpfClean, emailClean, matriculaClean]
      );

      const existingByMatricula = usersByMatricula[0];
      const existingByIdentifier = existingUsers[0];
      const existing = existingByMatricula || existingByIdentifier;

      if (!existing) {
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

        const { rows: [approvedReg] } = await client.query(
          `UPDATE registrations
           SET status = 'approved',
               identifier = $1,
               full_name = $2,
               role = $3,
               department = $4
           WHERE id = $5 AND course_id = $6
           RETURNING *`,
          [
            finalIdentifier,
            full_name || reg.full_name,
            role || reg.role,
            department || reg.department,
            registrationId,
            id,
          ]
        );

        await client.query('COMMIT');
        res.json({ message: 'Aprovado e usuário criado', registration: approvedReg });
      } else {
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

        const studentIdentifier = existing.cpf || existing.email
          ? normalizeIdentifier(existing.cpf || existing.email)
          : (existing.matricula || finalIdentifier);
        const studentIdentifiers = Array.from(new Set(
          [studentIdentifier, existing.cpf, existing.email, existing.matricula, finalIdentifier, normalizeIdentifier(finalIdentifier)]
            .filter(Boolean)
            .map((value: string) => String(value))
        ));
        const studentName = existing.name || full_name || reg.full_name;
        const studentRole = existing.cargo || role || reg.role;
        const studentDepartment = existing.departamento || department || reg.department;

        const { rows: matchingRegs } = await client.query(
          `SELECT id
           FROM registrations
           WHERE course_id = $1
             AND id <> $2
             AND identifier = ANY($3::text[])
           LIMIT 1
           FOR UPDATE`,
          [id, registrationId, studentIdentifiers]
        );

        let approvedRegistration;
        if (matchingRegs.length > 0) {
          await client.query('DELETE FROM registrations WHERE id = $1', [registrationId]);

          const { rows: [mergedReg] } = await client.query(
            `UPDATE registrations
             SET status = 'approved',
                 identifier = $1,
                 full_name = $2,
                 role = $3,
                 department = $4
             WHERE id = $5
             RETURNING *`,
            [studentIdentifier, studentName, studentRole, studentDepartment, matchingRegs[0].id]
          );

          approvedRegistration = mergedReg;
        } else {
          const { rows: [updatedReg] } = await client.query(
            `UPDATE registrations
             SET status = 'approved',
                 identifier = $1,
                 full_name = $2,
                 role = $3,
                 department = $4
             WHERE id = $5 AND course_id = $6
             RETURNING *`,
            [studentIdentifier, studentName, studentRole, studentDepartment, registrationId, id]
          );
          approvedRegistration = updatedReg;
        }

        await client.query('COMMIT');
        res.json({ message: 'Aluno já cadastrado. Inscrição aprovada no curso.', registration: approvedRegistration });
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
  const authenticatedUserId = getOptionalUserId(req);
  if (!identifier && !authenticatedUserId) {
    res.status(400).json({ error: 'Identificador obrigatório' });
    return;
  }
  const rawIdentifier = String(identifier || '').trim();
  const clean = normalizeIdentifier(rawIdentifier);
  const matriculaCandidate = rawIdentifier.toUpperCase();
  try {
    const { rows: courses } = await pool.query(
      'SELECT id, enrollment_open FROM courses WHERE id = $1',
      [req.params.id]
    );
    if (courses.length === 0) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }
    if (!courses[0].enrollment_open) {
      res.status(403).json({ error: 'Inscrições indisponíveis para este curso' });
      return;
    }

    let users;
    if (authenticatedUserId) {
      const result = await pool.query(
        `SELECT id, name, cpf, email, matricula, departamento, cargo
         FROM app_users
         WHERE id = $1`,
        [authenticatedUserId]
      );
      users = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id, name, cpf, email, matricula, departamento, cargo FROM app_users
         WHERE cpf = $1 OR email = $1 OR matricula = $1 OR matricula = $2`,
        [clean, matriculaCandidate]
      );
      users = result.rows;
    }

    if (users.length === 0) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }
    const user = users[0];

    // 2. Registra com identificador normalizado
    const storedIdentifier = user.cpf || user.email
      ? normalizeIdentifier(user.cpf || user.email)
      : user.matricula;
    if (!storedIdentifier) {
      res.status(400).json({ error: 'Cadastro do aluno sem CPF, e-mail ou matrícula' });
      return;
    }
    const { rows: registrations } = await pool.query(
      `INSERT INTO registrations (course_id, identifier, full_name, role, department, status)
       VALUES ($1, $2, $3, $4, $5, 'approved')
       ON CONFLICT (course_id, identifier) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         department = EXCLUDED.department,
         status = 'approved'
       RETURNING *`,
      [req.params.id, storedIdentifier, user.name, user.cargo, user.departamento]
    );
    res.json({ message: 'Inscrito com sucesso', registration: registrations[0] });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ error: 'Erro ao inscrever' });
  }
});

// PUT /api/courses/:id — Atualizar curso
router.put('/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, duration_hours, certificate_config, additional_teachers, start_date, end_date, enrollment_open } = req.body;

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
        enrollment_open = COALESCE($7, enrollment_open),
        updated_at = NOW()
       WHERE id = $8 AND ($9 = TRUE OR owner_id = $10) RETURNING *`,
      [title, description, duration_hours, certificate_config ? JSON.stringify(certificate_config) : null, start_date, end_date, typeof enrollment_open === 'boolean' ? enrollment_open : null, req.params.id, isAdmin(req.user), req.user!.id]
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
  const { title, description, start_date, end_date, duration_hours, enrollment_open } = req.body;

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
      `INSERT INTO courses (title, description, duration_hours, owner_id, certificate_config, start_date, end_date, parent_course_id, enrollment_open)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        title.trim(),
        description?.trim() || original.description || '',
        duration_hours || original.duration_hours || 0,
        req.user!.id,
        original.certificate_config,
        start_date || null,
        end_date || null,
        original.id,
        typeof enrollment_open === 'boolean' ? enrollment_open : original.enrollment_open !== false,
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
