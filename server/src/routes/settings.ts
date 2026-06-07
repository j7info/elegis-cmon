import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isAdminMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/settings — Buscar settings globais (PÚBLICO)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'global'");
    if (rows.length === 0) {
      res.json({ appName: 'Câmara de Ourilândia do Norte', logoUrl: '' });
      return;
    }
    res.json(rows[0].value);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// PUT /api/settings — Atualizar settings (protegido)
router.put('/', authMiddleware, isAdminMiddleware, async (req: AuthRequest, res: Response) => {
  const { appName, logoUrl } = req.body;

  try {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('global', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify({ appName: appName || '', logoUrl: logoUrl || '' })]
    );
    res.json({ message: 'Configurações salvas' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

export default router;
