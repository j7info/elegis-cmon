import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';

const router = Router();

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


export default router;
