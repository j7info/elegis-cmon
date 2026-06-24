import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

// GET /api/public/courses/:courseId — Obter dados públicos do curso
router.get('/courses/:courseId', async (req: Request, res: Response) => {
  const { courseId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, title, description, start_date, end_date, enrollment_open FROM courses WHERE id = $1',
      [courseId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Fetch public course error:', err);
    res.status(500).json({ error: 'Erro ao buscar curso' });
  }
});

// POST /api/public/pre-register — Pré-cadastro de aluno (sem matrícula)
router.post('/pre-register', async (req: Request, res: Response) => {
  const { name, cpf, email, cargo, departamento, orgao } = req.body;

  if (!name?.trim() || !cpf?.trim()) {
    res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
    return;
  }

  try {
    // Verificar se já existe (por CPF ou E-mail)
    const { rows: existing } = await pool.query(
      'SELECT id, name, cpf, is_pre_registered, matricula FROM app_users WHERE cpf = $1 OR email = $2 LIMIT 1',
      [cpf.trim(), email?.trim() || '']
    );

    if (existing.length > 0) {
      res.status(409).json({ 
        error: 'Usuário já cadastrado no sistema'
      });
      return;
    }

    // Inserir com matricula NULL e is_pre_registered = true
    // Vamos usar a senha vazia (ou hash inválido) já que não podem logar sem matrícula
    const dummyPassword = 'PRE_REGISTERED_NO_LOGIN';

    const { rows } = await pool.query(
      `INSERT INTO app_users (matricula, password_hash, name, email, cpf, cargo, departamento, orgao, status, is_pre_registered, must_change_password)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'Ativo', TRUE, TRUE) RETURNING id, name, email, cpf, is_pre_registered`,
      [dummyPassword, name.trim(), email?.trim() || null, cpf.trim(), cargo?.trim() || null, departamento?.trim() || null, orgao?.trim() || 'CMON']
    );

    res.status(201).json({ message: 'Pré-cadastro realizado com sucesso', user: rows[0] });
  } catch (err) {
    console.error('Pre-register error:', err);
    res.status(500).json({ error: 'Erro ao realizar pré-cadastro' });
  }
});


// POST /api/public/courses/:courseId/registrations — Cadastro prévio de aluno no curso
router.post('/courses/:courseId/registrations', async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const { identifier, full_name, role, department } = req.body;

  if (!identifier?.trim() || !full_name?.trim() || !role?.trim() || !department?.trim()) {
    res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    // Validate course exists
    const courseResult = await pool.query('SELECT id, enrollment_open FROM courses WHERE id = $1', [courseId]);
    if (courseResult.rows.length === 0) {
      res.status(404).json({ error: 'Curso não encontrado' });
      return;
    }
    if (!courseResult.rows[0].enrollment_open) {
      res.status(403).json({ error: 'Inscrições indisponíveis para este curso' });
      return;
    }

    // Verifica se o aluno já existe no sistema
    const userResult = await pool.query('SELECT id FROM app_users WHERE cpf = $1 OR email = $1 OR matricula = $1 LIMIT 1', [cleanIdentifier]);
    const isApproved = userResult.rows.length > 0;
    const status = isApproved ? 'approved' : 'pending';

    const { rows } = await pool.query(
      `INSERT INTO registrations (class_id, course_id, identifier, full_name, role, department, status)
       VALUES (NULL, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (course_id, identifier) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         department = EXCLUDED.department,
         status = CASE WHEN registrations.status = 'approved' THEN 'approved' ELSE EXCLUDED.status END
       RETURNING *`,
      [courseId, cleanIdentifier, full_name.trim(), role.trim(), department.trim(), status]
    );

    res.status(201).json({ registration: rows[0], isApproved });
  } catch (err) {
    console.error('Course registration error:', err);
    res.status(500).json({ error: 'Erro ao realizar cadastro' });
  }
});

export default router;
