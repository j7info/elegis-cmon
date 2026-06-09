import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

// POST /api/classes/:id/online/join — Aluno inicia/acessa aula online
router.post('/:id/online/join', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier, full_name } = req.body;

  if (!identifier?.trim() || !full_name?.trim()) {
    res.status(400).json({ error: 'Identificador e nome são obrigatórios' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    // Verifica se a aula existe e é online
    const { rows: classes } = await pool.query(
      'SELECT id, type, presentation_url, expected_duration_minutes, slide_minimum_seconds FROM classes WHERE id = $1',
      [id]
    );
    if (classes.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const cls = classes[0];
    if (cls.type !== 'online') {
      res.status(400).json({ error: 'Esta aula não é uma aula online' });
      return;
    }

    if (!cls.presentation_url) {
      res.status(400).json({ error: 'Esta aula ainda não possui apresentação' });
      return;
    }

    // Cria ou retorna progresso existente
    const { rows: progress } = await pool.query(
      `INSERT INTO class_online_progress (class_id, identifier, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, identifier) DO UPDATE SET
         full_name = EXCLUDED.full_name
       RETURNING *`,
      [id, cleanIdentifier, full_name.trim()]
    );

    res.json({
      progress: progress[0],
      class_id: cls.id,
      expected_duration_minutes: cls.expected_duration_minutes,
      slide_minimum_seconds: cls.slide_minimum_seconds,
    });
  } catch (err) {
    console.error('Online join error:', err);
    res.status(500).json({ error: 'Erro ao acessar aula online' });
  }
});

// GET /api/classes/:id/online/state — Estado atual da sessão do aluno
router.get('/:id/online/state', async (req: Request, res: Response) => {
  const { id } = req.params;
  const identifier = req.query.identifier as string;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    const { rows: classes } = await pool.query(
      `SELECT id, type, title, description, status, presentation_url,
              expected_duration_minutes, slide_minimum_seconds
       FROM classes WHERE id = $1`,
      [id]
    );
    if (classes.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const cls = classes[0];

    const { rows: progress } = await pool.query(
      'SELECT * FROM class_online_progress WHERE class_id = $1 AND identifier = $2',
      [id, cleanIdentifier]
    );

    // Calcula presença
    let presence_percentage: number | null = null;
    if (progress.length > 0 && progress[0].completed_at && cls.expected_duration_minutes && cls.expected_duration_minutes > 0) {
      const timeTakenMin = progress[0].total_time_spent_seconds / 60;
      presence_percentage = Math.min(100, Math.round((timeTakenMin / cls.expected_duration_minutes) * 100));
    }

    res.json({
      class: {
        id: cls.id,
        title: cls.title,
        description: cls.description,
        status: cls.status,
        presentation_url: cls.presentation_url,
        expected_duration_minutes: cls.expected_duration_minutes,
        slide_minimum_seconds: cls.slide_minimum_seconds,
      },
      progress: progress.length > 0 ? progress[0] : null,
      presence_percentage,
    });
  } catch (err) {
    console.error('Online state error:', err);
    res.status(500).json({ error: 'Erro ao buscar estado da aula' });
  }
});

// POST /api/classes/:id/online/advance — Avançar para o próximo slide
router.post('/:id/online/advance', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    const { rows: progress } = await pool.query(
      'SELECT * FROM class_online_progress WHERE class_id = $1 AND identifier = $2 FOR UPDATE',
      [id, cleanIdentifier]
    );

    if (progress.length === 0) {
      res.status(404).json({ error: 'Sessão não encontrada. Faça join primeiro.' });
      return;
    }

    const prog = progress[0];

    if (prog.completed_at) {
      res.status(400).json({ error: 'Esta aula já foi concluída' });
      return;
    }

    // Verifica tempo mínimo no slide atual
    const { rows: classes } = await pool.query(
      'SELECT slide_minimum_seconds FROM classes WHERE id = $1',
      [id]
    );
    const minSecs = classes[0]?.slide_minimum_seconds ?? 30;
    const elapsed = (Date.now() - new Date(prog.slide_started_at).getTime()) / 1000;

    if (elapsed < minSecs) {
      const falta = Math.ceil(minSecs - elapsed);
      res.status(429).json({
        error: `Aguarde mais ${falta} segundo(s) para avançar`,
        required_seconds: minSecs,
        elapsed_seconds: Math.floor(elapsed),
        remaining_seconds: falta,
      });
      return;
    }

    // Adiciona o tempo gasto neste slide
    const timeOnSlide = Math.floor(elapsed);
    const newTotalTime = prog.total_time_spent_seconds + timeOnSlide;
    const nextSlide = prog.current_slide + 1;

    // Atualiza progresso
    const { rows: updated } = await pool.query(
      `UPDATE class_online_progress
       SET current_slide = $1,
           slide_started_at = NOW(),
           total_time_spent_seconds = $2
       WHERE id = $3
       RETURNING *`,
      [nextSlide, newTotalTime, prog.id]
    );

    res.json({
      progress: updated[0],
      time_on_slide: timeOnSlide,
      total_time_spent_seconds: newTotalTime,
    });
  } catch (err) {
    console.error('Online advance error:', err);
    res.status(500).json({ error: 'Erro ao avançar slide' });
  }
});

// POST /api/classes/:id/online/complete — Concluir aula online
router.post('/:id/online/complete', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    const { rows: progress } = await pool.query(
      `UPDATE class_online_progress
       SET completed_at = NOW(),
           total_time_spent_seconds = total_time_spent_seconds +
             EXTRACT(EPOCH FROM (NOW() - slide_started_at))::int
       WHERE class_id = $1 AND identifier = $2 AND completed_at IS NULL
       RETURNING *`,
      [id, cleanIdentifier]
    );

    if (progress.length === 0) {
      res.status(404).json({ error: 'Sessão não encontrada ou já concluída' });
      return;
    }

    // Calcula presença
    const { rows: classes } = await pool.query(
      'SELECT expected_duration_minutes FROM classes WHERE id = $1',
      [id]
    );
    const expectedMin = classes[0]?.expected_duration_minutes || 1;
    const timeTakenMin = progress[0].total_time_spent_seconds / 60;
    const presencePct = Math.min(100, Math.round((timeTakenMin / expectedMin) * 100));

    res.json({
      progress: progress[0],
      presence_percentage: presencePct,
      total_time_spent_seconds: progress[0].total_time_spent_seconds,
      expected_duration_minutes: expectedMin,
    });
  } catch (err) {
    console.error('Online complete error:', err);
    res.status(500).json({ error: 'Erro ao concluir aula' });
  }
});

// GET /api/classes/:id/online/slides — Lista de slides (caminhos das imagens para o aluno)
router.get('/:id/online/slides', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { rows: classes } = await pool.query(
      'SELECT presentation_url, type FROM classes WHERE id = $1',
      [id]
    );
    if (classes.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }
    if (classes[0].type !== 'online') {
      res.status(400).json({ error: 'Aula não é online' });
      return;
    }
    if (!classes[0].presentation_url) {
      res.status(400).json({ error: 'Aula sem apresentação' });
      return;
    }

    res.json({
      presentation_url: classes[0].presentation_url,
    });
  } catch (err) {
    console.error('Online slides error:', err);
    res.status(500).json({ error: 'Erro ao buscar slides' });
  }
});

export default router;
