import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { generateToken, blacklistToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import crypto from 'crypto';
import { sendRecoveryEmail } from '../lib/mailer.js';
import { getAppBaseUrl } from '../lib/security.js';

const router = Router();

// POST /api/auth/login — Login por matrícula
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { matricula, password } = req.body;

  if (!matricula || !password) {
    res.status(400).json({ error: 'Matrícula e senha são obrigatórios' });
    return;
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM app_users WHERE UPPER(matricula) = UPPER($1)',
      [matricula.trim()]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: 'Matrícula ou senha inválida' });
      return;
    }

    const user = rows[0];

    if (user.status !== 'Ativo') {
      res.status(403).json({ error: 'Usuário inativo. Contate o administrador.' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Matrícula ou senha inválida' });
      return;
    }

    const tokenUser = {
      id: user.id,
      matricula: user.matricula,
      name: user.name,
      email: user.email,
      cargo: user.cargo,
      departamento: user.departamento,
      system_role: user.system_role,
    };

    const token = generateToken(tokenUser);

    res.json({
      token,
      user: {
        ...tokenUser,
        cpf: user.cpf,
        funcao_confianca: user.funcao_confianca,
        orgao: user.orgao,
        status: user.status,
        must_change_password: user.must_change_password,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro interno no login' });
  }
});

// POST /api/auth/change-password — Trocar senha
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { current_password, new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    return;
  }

  try {
    const { rows } = await pool.query('SELECT password_hash, must_change_password FROM app_users WHERE id = $1', [req.user!.id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    if (!rows[0].must_change_password && !current_password) {
      res.status(400).json({ error: 'Senha atual é obrigatória' });
      return;
    }

    if (current_password) {
      const valid = await bcrypt.compare(current_password, rows[0].password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Senha atual incorreta' });
        return;
      }
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE app_users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
      [newHash, req.user!.id]
    );

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// GET /api/auth/me — Dados do usuário logado
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, matricula, name, email, cpf, cargo, funcao_confianca, departamento, orgao, status, must_change_password, system_role
       FROM app_users WHERE id = $1`,
      [req.user!.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

// POST /api/auth/logout — Encerrar sessão
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await blacklistToken(token);
  }
  res.json({ message: 'Sessão encerrada' });
});

// POST /api/auth/forgot-password — Esqueci a senha
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  const { matricula } = req.body;
  if (!matricula) {
    res.status(400).json({ error: 'Matrícula é obrigatória' });
    return;
  }
  
  try {
    const { rows } = await pool.query('SELECT id, email FROM app_users WHERE UPPER(matricula) = UPPER($1)', [matricula.trim()]);
    if (rows.length === 0) {
      // Evita vazamento de usuários
      res.json({ message: 'Se a matrícula existir no sistema, as instruções foram enviadas para o e-mail cadastrado.' });
      return;
    }
    
    const user = rows[0];
    if (!user.email) {
      res.status(400).json({ error: 'Usuário sem e-mail cadastrado. Solicite ao administrador que atualize seu cadastro.' });
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
    
    res.json({ message: 'E-mail de recuperação enviado com sucesso.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// POST /api/auth/reset-password — Redefinir com token
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;
  
  if (!token || !password || password.length < 6) {
    res.status(400).json({ error: 'Token inválido ou senha muito curta (mín. 6 caracteres)' });
    return;
  }
  
  try {
    const { rows } = await pool.query(
      'SELECT id, reset_token_expires FROM app_users WHERE reset_token = $1',
      [token]
    );
    
    if (rows.length === 0) {
      res.status(400).json({ error: 'Link de recuperação inválido ou já utilizado' });
      return;
    }
    
    const user = rows[0];
    if (Date.now() > Number(user.reset_token_expires)) {
      res.status(400).json({ error: 'Este link de recuperação expirou. Solicite outro.' });
      return;
    }
    
    const newHash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE app_users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, must_change_password = FALSE, updated_at = NOW() WHERE id = $2',
      [newHash, user.id]
    );
    
    res.json({ message: 'Senha redefinida com sucesso. Você já pode fazer login com a nova senha.' });
  } catch (err) {
    console.error('Reset password token error:', err);
    res.status(500).json({ error: 'Erro ao redefinir a senha' });
  }
});

export default router;
