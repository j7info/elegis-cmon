import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isCourseCreatorMiddleware } from '../middleware/auth.js';
import { upload, UPLOAD_DIR } from '../middleware/upload.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

router.get('/:classId/interactive', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT il.*,
              c.expected_duration_minutes,
              c.slide_minimum_seconds
       FROM interactive_lessons il
       JOIN classes c ON c.id = il.class_id
       WHERE il.class_id = $1`,
      [req.params.classId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Aula interativa não encontrada' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Get interactive lesson error:', err);
    res.status(500).json({ error: 'Erro ao buscar aula interativa' });
  }
});

router.post('/:classId/interactive', authMiddleware, isCourseCreatorMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  const { type, definition, html_content } = req.body;
  let html_url = req.body.html_url;

  try {
    if (type === 'html' && req.file) {
      if (req.file.mimetype === 'application/zip' || req.file.originalname.endsWith('.zip')) {
        const slug = Date.now().toString() + '-' + Math.round(Math.random() * 1e9);
        const extractPath = path.join(UPLOAD_DIR, 'interactive', slug);
        
        const zip = new AdmZip(req.file.path);
        zip.extractAllTo(extractPath, true);
        
        // Remove the uploaded zip file
        fs.unlinkSync(req.file.path);
        
        let entryPath = req.body.entry || 'index.html';
        html_url = `/api/uploads/interactive/${slug}/${entryPath}`;
      } else if (req.file.mimetype === 'text/html' || req.file.originalname.endsWith('.html')) {
        // Just uploaded a single html file
        const slug = Date.now().toString() + '-' + Math.round(Math.random() * 1e9);
        const destDir = path.join(UPLOAD_DIR, 'interactive', slug);
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, req.file.originalname);
        fs.renameSync(req.file.path, destPath);
        html_url = `/api/uploads/interactive/${slug}/${req.file.originalname}`;
      }
    }

    let parsedDefinition = null;
    if (definition) {
      try {
        parsedDefinition = typeof definition === 'string' ? JSON.parse(definition) : definition;
      } catch(e) {
        // Ignore if invalid JSON
      }
    }

    const query = `
      INSERT INTO interactive_lessons (class_id, type, definition, html_url, html_content)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (class_id) DO UPDATE SET
        type = EXCLUDED.type,
        definition = EXCLUDED.definition,
        html_url = EXCLUDED.html_url,
        html_content = EXCLUDED.html_content,
        updated_at = NOW()
      RETURNING *
    `;
    const { rows } = await pool.query(query, [classId, type, parsedDefinition, html_url, html_content]);
    
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Save interactive lesson error:', err);
    res.status(500).json({ error: 'Erro ao salvar aula interativa' });
  }
});

router.put('/:classId/interactive', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  const { type, definition, html_url, html_content } = req.body;

  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIdx = 1;

    if (type !== undefined) {
      setClauses.push(`type = $${paramIdx++}`);
      values.push(type);
    }
    if (definition !== undefined) {
      setClauses.push(`definition = $${paramIdx++}`);
      values.push(typeof definition === 'string' ? JSON.parse(definition) : definition);
    }
    if (html_url !== undefined) {
      setClauses.push(`html_url = $${paramIdx++}`);
      values.push(html_url);
    }
    if (html_content !== undefined) {
      setClauses.push(`html_content = $${paramIdx++}`);
      values.push(html_content);
    }
    
    values.push(classId);

    const query = `
      UPDATE interactive_lessons SET ${setClauses.join(', ')}
      WHERE class_id = $${paramIdx}
      RETURNING *
    `;
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Aula interativa não encontrada' });
      return;
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Update interactive lesson error:', err);
    res.status(500).json({ error: 'Erro ao atualizar aula interativa' });
  }
});

router.delete('/:classId/interactive', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  try {
    const { rows } = await pool.query('DELETE FROM interactive_lessons WHERE class_id = $1 RETURNING *', [classId]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Aula interativa não encontrada' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete interactive lesson error:', err);
    res.status(500).json({ error: 'Erro ao remover aula interativa' });
  }
});

// POST /api/classes/:classId/interactive/join
router.post('/:classId/interactive/join', async (req: Request, res: Response) => {
  const { classId } = req.params;
  const { identifier, full_name } = req.body;

  if (!identifier?.trim() || !full_name?.trim()) {
    res.status(400).json({ error: 'Identificador e nome são obrigatórios' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);
  const cleanFullName = full_name.trim();

  if (!cleanIdentifier) {
    res.status(400).json({ error: 'Informe um CPF, e-mail ou matrícula válido' });
    return;
  }

  if (cleanIdentifier.length > 255) {
    res.status(400).json({ error: 'Identificador deve ter no máximo 255 caracteres' });
    return;
  }

  try {
    const { rows: progress } = await pool.query(
      `INSERT INTO class_online_progress (class_id, identifier, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, identifier) DO UPDATE SET
         full_name = EXCLUDED.full_name
       RETURNING *`,
      [classId, cleanIdentifier, cleanFullName.slice(0, 255)]
    );
    res.json({
      progress: progress[0],
      presence_percentage: progress[0]?.completed_at ? 100 : null,
    });
  } catch (err) {
    console.error('Interactive join error:', err);
    res.status(500).json({ error: 'Erro ao acessar aula interativa' });
  }
});

// GET /api/classes/:classId/interactive/state
router.get('/:classId/interactive/state', async (req: Request, res: Response) => {
  const { classId } = req.params;
  const identifier = req.query.identifier as string;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  if (!cleanIdentifier) {
    res.status(400).json({ error: 'Informe um CPF, e-mail ou matrícula válido' });
    return;
  }

  try {
    const { rows: progress } = await pool.query(
      'SELECT * FROM class_online_progress WHERE class_id = $1 AND identifier = $2',
      [classId, cleanIdentifier]
    );

    res.json({
      progress: progress.length > 0 ? progress[0] : null,
      presence_percentage: progress[0]?.completed_at ? 100 : null,
    });
  } catch (err) {
    console.error('Interactive state error:', err);
    res.status(500).json({ error: 'Erro ao buscar estado da aula interativa' });
  }
});

// POST /api/classes/:classId/interactive/complete
router.post('/:classId/interactive/complete', async (req: Request, res: Response) => {
  const { classId } = req.params;
  const { identifier } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  if (!cleanIdentifier) {
    res.status(400).json({ error: 'Informe um CPF, e-mail ou matrícula válido' });
    return;
  }

  try {
    const { rows: classes } = await pool.query(
      'SELECT expected_duration_minutes FROM classes WHERE id = $1',
      [classId]
    );
    const expectedMin = classes[0]?.expected_duration_minutes || 1;
    const requiredSeconds = expectedMin * 60;

    const { rows: progress } = await pool.query(
      `UPDATE class_online_progress
       SET completed_at = NOW(),
           total_time_spent_seconds = $1
       WHERE class_id = $2 AND identifier = $3 AND completed_at IS NULL
       RETURNING *`,
      [requiredSeconds, classId, cleanIdentifier]
    );
    
    if (progress.length === 0) {
      // If it was already completed or not found
      res.json({ success: true, message: 'Já concluído ou sessão inválida' });
      return;
    }

    res.json({ progress: progress[0], presence_percentage: 100 });
  } catch (err) {
    console.error('Interactive complete error:', err);
    res.status(500).json({ error: 'Erro ao concluir aula interativa' });
  }
});

export default router;
