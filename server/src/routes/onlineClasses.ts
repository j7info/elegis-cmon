import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

const VIDEO_COMPLETE_TOLERANCE_SECONDS = 3;

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
      'SELECT id, type, presentation_url, expected_duration_minutes, slide_minimum_seconds, online_content_type, video_url, video_id, video_duration_seconds FROM classes WHERE id = $1',
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

    if (cls.online_content_type === 'video' && !cls.video_id) {
      res.status(400).json({ error: 'Esta aula ainda nao possui video configurado' });
      return;
    }

    if (cls.online_content_type !== 'video' && !cls.presentation_url) {
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
      online_content_type: cls.online_content_type,
      video_id: cls.video_id,
      video_duration_seconds: cls.video_duration_seconds,
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
              expected_duration_minutes, slide_minimum_seconds,
              online_content_type, video_url, video_id, video_duration_seconds
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
    if (progress.length > 0 && progress[0].completed_at && cls.online_content_type === 'video') {
      presence_percentage = 100;
    } else if (progress.length > 0 && progress[0].completed_at && cls.expected_duration_minutes && cls.expected_duration_minutes > 0) {
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
        online_content_type: cls.online_content_type,
        video_url: cls.video_url,
        video_id: cls.video_id,
        video_duration_seconds: cls.video_duration_seconds,
      },
      progress: progress.length > 0 ? progress[0] : null,
      presence_percentage,
    });
  } catch (err) {
    console.error('Online state error:', err);
    res.status(500).json({ error: 'Erro ao buscar estado da aula' });
  }
});

// POST /api/classes/:id/online/video-progress — Registrar progresso em aula de video
router.post('/:id/online/video-progress', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier, current_seconds, duration_seconds } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const currentSeconds = Math.max(0, Math.floor(Number(current_seconds) || 0));
  const durationSeconds = Math.max(0, Math.floor(Number(duration_seconds) || 0));
  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    const { rows: classes } = await pool.query(
      `SELECT id, online_content_type, video_duration_seconds
       FROM classes
       WHERE id = $1 AND type = 'online'`,
      [id]
    );

    if (classes.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }
    if (classes[0].online_content_type !== 'video') {
      res.status(400).json({ error: 'Esta aula não é uma aula em vídeo' });
      return;
    }

    const knownDuration = classes[0].video_duration_seconds || durationSeconds || null;
    if (durationSeconds > 0 && (!classes[0].video_duration_seconds || Math.abs(classes[0].video_duration_seconds - durationSeconds) > 1)) {
      await pool.query(
        `UPDATE classes
         SET video_duration_seconds = $1,
             expected_duration_minutes = CEIL($1::numeric / 60)::int,
             updated_at = NOW()
         WHERE id = $2`,
        [durationSeconds, id]
      );
    }

    const cappedPosition = knownDuration ? Math.min(currentSeconds, knownDuration) : currentSeconds;
    const isComplete = Boolean(knownDuration && cappedPosition >= Math.max(0, knownDuration - VIDEO_COMPLETE_TOLERANCE_SECONDS));

    const { rows } = await pool.query(
      `UPDATE class_online_progress
       SET max_video_position_seconds = GREATEST(max_video_position_seconds, $1),
           video_duration_seconds = COALESCE($2, video_duration_seconds),
           total_time_spent_seconds = GREATEST(total_time_spent_seconds, $1),
           completed_at = CASE
             WHEN completed_at IS NOT NULL THEN completed_at
             WHEN $3 = TRUE THEN NOW()
             ELSE completed_at
           END
       WHERE class_id = $4 AND identifier = $5
       RETURNING *`,
      [cappedPosition, knownDuration, isComplete, id, cleanIdentifier]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Sessão não encontrada. Faça join primeiro.' });
      return;
    }

    res.json({
      progress: rows[0],
      completed: Boolean(rows[0].completed_at),
      duration_seconds: knownDuration,
      remaining_seconds: knownDuration ? Math.max(0, knownDuration - rows[0].max_video_position_seconds) : null,
    });
  } catch (err) {
    console.error('Video progress error:', err);
    res.status(500).json({ error: 'Erro ao registrar progresso do vídeo' });
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
    const { rows: classes } = await pool.query(
      'SELECT online_content_type, video_duration_seconds, expected_duration_minutes FROM classes WHERE id = $1',
      [id]
    );

    if (classes.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    if (classes[0].online_content_type === 'video') {
      const { rows: current } = await pool.query(
        'SELECT * FROM class_online_progress WHERE class_id = $1 AND identifier = $2',
        [id, cleanIdentifier]
      );
      const prog = current[0];
      const duration = prog?.video_duration_seconds || classes[0].video_duration_seconds || 0;
      if (!prog || !duration || prog.max_video_position_seconds < Math.max(0, duration - VIDEO_COMPLETE_TOLERANCE_SECONDS)) {
        res.status(400).json({ error: 'Assista ao vídeo completo antes de concluir a aula' });
        return;
      }
    }

    const updateSql = classes[0].online_content_type === 'video'
      ? `UPDATE class_online_progress
         SET completed_at = COALESCE(completed_at, NOW()),
             total_time_spent_seconds = GREATEST(total_time_spent_seconds, COALESCE(video_duration_seconds, $3))
         WHERE class_id = $1 AND identifier = $2
         RETURNING *`
      : `UPDATE class_online_progress
         SET completed_at = NOW(),
             total_time_spent_seconds = total_time_spent_seconds +
               EXTRACT(EPOCH FROM (NOW() - slide_started_at))::int
         WHERE class_id = $1 AND identifier = $2 AND completed_at IS NULL
         RETURNING *`;

    const { rows: progress } = await pool.query(updateSql, [id, cleanIdentifier, classes[0].video_duration_seconds || 0]);

    if (progress.length === 0) {
      res.status(404).json({ error: 'Sessão não encontrada ou já concluída' });
      return;
    }

    // Calcula presença
    const expectedMin = classes[0]?.expected_duration_minutes || 1;
    const timeTakenMin = progress[0].total_time_spent_seconds / 60;
    const presencePct = classes[0].online_content_type === 'video'
      ? 100
      : Math.min(100, Math.round((timeTakenMin / expectedMin) * 100));

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

// GET /api/classes/:id/online/evaluation — Avaliação online vinculada à aula
router.get('/:id/online/evaluation', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.question_time,
              COUNT(q.id)::int AS question_count
       FROM evaluations e
       LEFT JOIN questions q ON q.evaluation_id = e.id
       JOIN classes cl ON cl.id = e.class_id
       WHERE e.class_id = $1
         AND e.type = 'online'
         AND cl.type = 'online'
       GROUP BY e.id, e.title, e.question_time
       ORDER BY e.created_at DESC
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Nenhuma avaliação online disponível para esta aula' });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Online evaluation lookup error:', err);
    res.status(500).json({ error: 'Erro ao buscar avaliação online' });
  }
});

export default router;
