import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdminMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';
import { sendRecoveryEmail } from '../lib/mailer.js';
import { getAppBaseUrl } from '../lib/security.js';

const router = Router();

// GET /api/users — Listar todos os usuários
router.get('/', authMiddleware, isAdminMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, matricula, name, email, cpf, cargo, funcao_confianca, departamento, orgao, status, created_at, is_pre_registered, system_role
       FROM app_users ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// POST /api/users — Adicionar usuário
router.post('/', authMiddleware, isAdminMiddleware, async (req: AuthRequest, res: Response) => {
  const { matricula, name, email, cargo, funcao_confianca, departamento, cpf } = req.body;

  if (!matricula?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'Matrícula e nome são obrigatórios' });
    return;
  }

  // Validate matrícula format: LLLLNNNNN
  const matriculaClean = matricula.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{5}$/.test(matriculaClean)) {
    res.status(400).json({ error: 'Matrícula deve estar no formato LLLLNNNNN (4 letras + 5 números)' });
    return;
  }

  try {
    // Default password = matrícula em minúsculo
    const passwordHash = await bcrypt.hash(matriculaClean.toLowerCase(), 12);

    const { rows } = await pool.query(
      `INSERT INTO app_users (matricula, password_hash, name, email, cpf, cargo, funcao_confianca, departamento, orgao, status, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CMON', 'Ativo', TRUE) RETURNING
       id, matricula, name, email, cpf, cargo, funcao_confianca, departamento, orgao, status, created_at`,
      [matriculaClean, passwordHash, name.trim(), email?.trim() || null, cpf?.trim() || null,
       cargo?.trim() || null, funcao_confianca?.trim() || null, departamento?.trim() || null]
    );

    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Matrícula já cadastrada' });
      return;
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// PUT /api/users/:id — Atualizar usuário
router.put('/:id', authMiddleware, isAdminMiddleware, async (req: Request, res: Response) => {
  const { name, email, cargo, funcao_confianca, departamento, status, cpf, system_role } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE app_users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        cargo = COALESCE($3, cargo),
        funcao_confianca = COALESCE($4, funcao_confianca),
        departamento = COALESCE($5, departamento),
        status = COALESCE($6, status),
        cpf = COALESCE($7, cpf),
        system_role = COALESCE($8, system_role),
        updated_at = NOW()
       WHERE id = $9 RETURNING id, matricula, name, email, cpf, cargo, funcao_confianca, departamento, orgao, status, system_role`,
      [name, email, cargo, funcao_confianca, departamento, status, cpf, system_role, req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// DELETE /api/users/:id — Remover usuário
router.delete('/:id', authMiddleware, isAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user!.id) {
      res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
      return;
    }

    const { rowCount } = await pool.query('DELETE FROM app_users WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json({ message: 'Usuário removido' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Erro ao remover usuário' });
  }
});

// POST /api/users/:id/reset-password — Reset senha para matrícula (admin)
router.post('/:id/reset-password', authMiddleware, isAdminMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query('SELECT id, matricula, email FROM app_users WHERE id = $1', [id]);
    
    if (rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const user = rows[0];

    if (!user.email) {
      res.status(400).json({ error: 'Usuário não possui e-mail cadastrado. Edite o usuário e insira um e-mail válido para poder resetar a senha.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 2 * 60 * 60 * 1000; // 2 horas
    
    await pool.query(
      'UPDATE app_users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );
    
    const baseUrl = getAppBaseUrl(req);
    await sendRecoveryEmail(user.email, token, baseUrl);

    res.json({ message: 'E-mail de recuperação enviado com sucesso para o usuário.' });
  } catch (err) {
    console.error('Reset password email error:', err);
    res.status(500).json({ error: 'Erro ao enviar e-mail de recuperação' });
  }
});

// POST /api/users/:id/assign-matricula — Atribuir matrícula a pré-cadastrado
router.post('/:id/assign-matricula', authMiddleware, isAdminMiddleware, async (req: AuthRequest, res: Response) => {
  const { matricula } = req.body;
  if (!matricula?.trim()) {
    res.status(400).json({ error: 'Matrícula é obrigatória' });
    return;
  }
  
  const matriculaClean = matricula.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{5}$/.test(matriculaClean)) {
    res.status(400).json({ error: 'Matrícula deve estar no formato LLLLNNNNN (4 letras + 5 números)' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(matriculaClean.toLowerCase(), 12);

    const { rows } = await pool.query(
      `UPDATE app_users SET 
        matricula = $1, 
        password_hash = $2, 
        is_pre_registered = FALSE, 
        must_change_password = TRUE, 
        updated_at = NOW() 
       WHERE id = $3 AND (matricula IS NULL OR is_pre_registered = TRUE) RETURNING id, matricula, is_pre_registered`,
      [matriculaClean, passwordHash, req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado ou já possui matrícula definitiva' });
      return;
    }

    res.json({ message: 'Matrícula atribuída com sucesso', user: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Matrícula já cadastrada para outro usuário' });
      return;
    }
    console.error('Assign matricula error:', err);
    res.status(500).json({ error: 'Erro ao atribuir matrícula' });
  }
});

// POST /api/users/import-csv — Importar usuários via CSV
router.post('/import-csv', authMiddleware, isAdminMiddleware, async (req: AuthRequest, res: Response) => {
  const { csvText } = req.body;
  if (!csvText) {
    res.status(400).json({ error: 'Nenhum conteúdo CSV enviado' });
    return;
  }

  try {
    const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim() !== '');
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV vazio ou sem cabeçalho' });
      return;
    }

    // Pular cabeçalho
    const dataLines = lines.slice(1);
    let importedCount = 0;
    let errorCount = 0;

    for (const line of dataLines) {
      // O CSV está separado por ponto e vírgula (;)
      const values = line.split(';').map((v: string) => v.replace(/^"|"$/g, '').trim());
      
      // Mapeamento baseado no arquivo pessoas (6).csv:
      // 0: Órgão, 1: Cargo, 2: Função, 3: Unidade, 4: Nome, 5: Nascimento, 6: CPF, 7: Email, 8: Matrícula, ..., 13: Status
      const orgao = values[0] || 'CMON';
      const cargo = values[1] || null;
      const funcao_confianca = values[2] || null;
      const departamento = values[3] || null;
      const name = values[4];
      const cpf = values[6] || null;
      const email = values[7] || null;
      const matricula = values[8];
      const status = values[13] || 'Ativo';
      
      if (!matricula || !name) continue;

      try {
        const passwordHash = await bcrypt.hash(matricula.toLowerCase(), 12);
        
        await pool.query(
          `INSERT INTO app_users (
            matricula, password_hash, name, cargo, funcao_confianca, departamento, 
            email, orgao, status, cpf, must_change_password, system_role
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'ALUNO')
          ON CONFLICT (matricula) DO UPDATE SET
            name = EXCLUDED.name,
            cargo = EXCLUDED.cargo,
            funcao_confianca = EXCLUDED.funcao_confianca,
            departamento = EXCLUDED.departamento,
            email = EXCLUDED.email,
            orgao = EXCLUDED.orgao,
            status = EXCLUDED.status,
            cpf = EXCLUDED.cpf,
            updated_at = NOW()`,
          [matricula.toUpperCase(), passwordHash, name, cargo, funcao_confianca, 
           departamento, email, orgao, status, cpf]
        );
        importedCount++;
      } catch (err) {
        console.error('Error inserting row', matricula, err);
        errorCount++;
      }
    }

    res.json({ message: 'Importação finalizada', imported: importedCount, errors: errorCount });
  } catch (err) {
    console.error('CSV import error:', err);
    res.status(500).json({ error: 'Erro ao processar CSV' });
  }
});

export default router;
