import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

const VIDEO_COMPLETE_TOLERANCE_SECONDS = 3;

function uniqueIdentifiers(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(v => v?.trim()).filter((v): v is string => Boolean(v))));
}

async function resolveStudentIdentifiers(identifier: string): Promise<string[]> {
  const raw = identifier.trim();
  const clean = normalizeIdentifier(raw);
  const rawLower = raw.toLowerCase();
  const rawUpper = raw.toUpperCase();

  const { rows } = await pool.query(
    `SELECT cpf, email, matricula
     FROM app_users
     WHERE regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = $1
        OR lower(COALESCE(email, '')) = $2
        OR upper(COALESCE(matricula, '')) = $3
        OR regexp_replace(COALESCE(matricula, ''), '\\D', '', 'g') = $1`,
    [clean, rawLower, rawUpper]
  );

  return uniqueIdentifiers([
    clean,
    ...rows.flatMap((user: any) => [
      user.cpf ? normalizeIdentifier(user.cpf) : null,
      user.email ? normalizeIdentifier(user.email) : null,
      user.matricula ? user.matricula.trim().toUpperCase() : null,
      user.matricula ? normalizeIdentifier(user.matricula) : null,
    ]),
  ]);
}

async function findBestOnlineProgress(classId: string, identifiers: string[], forUpdate = false) {
  const { rows } = await pool.query(
    `SELECT *
     FROM class_online_progress
     WHERE class_id = $1 AND identifier = ANY($2::text[])
     ORDER BY
       completed_at DESC NULLS LAST,
       current_slide DESC,
       COALESCE(max_video_position_seconds, 0) DESC,
       total_time_spent_seconds DESC,
       created_at DESC
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [classId, identifiers]
  );
  return rows[0] || null;
}

function calculateOnlinePresencePercentage(progress: any, cls: any): number | null {
  if (!progress) return null;
  if (progress.completed_at) return 100;

  if (cls.online_content_type === 'video') {
    const duration = Number(cls.video_duration_seconds || progress.video_duration_seconds || 0);
    if (duration <= 0) return 0;
    return Math.min(100, Math.round((Number(progress.max_video_position_seconds || 0) / duration) * 100));
  }

  const expectedMin = Number(cls.expected_duration_minutes || 0);
  if (expectedMin <= 0) return 0;
  return Math.min(100, Math.round(((Number(progress.total_time_spent_seconds || 0) / 60) / expectedMin) * 100));
}

// POST /api/classes/:id/online/join — Aluno inicia/acessa aula online
router.post('/:id/online/join', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier, full_name } = req.body;

  if (!identifier?.trim() || !full_name?.trim()) {
    res.status(400).json({ error: 'Identificador e nome são obrigatórios' });
    return;
  }

  try {
    const identifiers = await resolveStudentIdentifiers(identifier);
    const cleanIdentifier = identifiers[0] || normalizeIdentifier(identifier);

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

    const existingProgress = await findBestOnlineProgress(id, identifiers);
    if (existingProgress) {
      const { rows: updated } = await pool.query(
        `UPDATE class_online_progress
         SET full_name = $1
         WHERE id = $2
         RETURNING *`,
        [full_name.trim(), existingProgress.id]
      );

      res.json({
        progress: updated[0],
        class_id: cls.id,
        expected_duration_minutes: cls.expected_duration_minutes,
        slide_minimum_seconds: cls.slide_minimum_seconds,
        online_content_type: cls.online_content_type,
        video_id: cls.video_id,
        video_duration_seconds: cls.video_duration_seconds,
      });
      return;
    }

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

  try {
    const identifiers = await resolveStudentIdentifiers(identifier);

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

    const bestProgress = await findBestOnlineProgress(id, identifiers);
    const progress = bestProgress ? [bestProgress] : [];

    const presence_percentage = calculateOnlinePresencePercentage(progress[0], cls);

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
  try {
    const identifiers = await resolveStudentIdentifiers(identifier);

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
         SET video_duration_seconds = $1::int,
             expected_duration_minutes = CEIL($1::numeric / 60)::int,
             updated_at = NOW()
         WHERE id = $2`,
        [durationSeconds, id]
      );
    }

    const cappedPosition = knownDuration ? Math.min(currentSeconds, knownDuration) : currentSeconds;
    const isComplete = Boolean(knownDuration && cappedPosition >= Math.max(0, knownDuration - VIDEO_COMPLETE_TOLERANCE_SECONDS));

    const existingProgress = await findBestOnlineProgress(id, identifiers);
    if (!existingProgress) {
      res.status(404).json({ error: 'Sessão não encontrada. Faça join primeiro.' });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE class_online_progress
       SET max_video_position_seconds = GREATEST(max_video_position_seconds, $1::int),
           video_duration_seconds = COALESCE($2::int, video_duration_seconds),
           total_time_spent_seconds = GREATEST(total_time_spent_seconds, $1::int),
           completed_at = CASE
             WHEN completed_at IS NOT NULL THEN completed_at
             WHEN $3::boolean = TRUE THEN NOW()
             ELSE completed_at
           END
       WHERE id = $4
       RETURNING *`,
      [cappedPosition, knownDuration, isComplete, existingProgress.id]
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
  const { identifier, slide_index } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  try {
    const identifiers = await resolveStudentIdentifiers(identifier);
    const existingProgress = await findBestOnlineProgress(id, identifiers, true);
    const progress = existingProgress ? [existingProgress] : [];

    if (progress.length === 0) {
      res.status(404).json({ error: 'Sessão não encontrada. Faça join primeiro.' });
      return;
    }

    const prog = progress[0];
    const requestedSlide = Math.max(0, Math.floor(Number(slide_index) || 0));
    const targetSlide = requestedSlide > 0 ? requestedSlide : prog.current_slide + 1;

    if (prog.completed_at) {
      res.status(400).json({ error: 'Esta aula já foi concluída' });
      return;
    }

    if (targetSlide <= prog.current_slide) {
      res.json({
        progress: prog,
        time_on_slide: 0,
        total_time_spent_seconds: prog.total_time_spent_seconds,
        already_recorded: true,
      });
      return;
    }

    const isInteractiveSlideEvent = requestedSlide > 0;

    // Verifica tempo mínimo no slide atual apenas para o leitor online padrão.
    // Aulas interativas HTML navegam livremente; elas só emitem o slide visto
    // e o sistema registra o histórico.
    const { rows: classes } = await pool.query(
      'SELECT slide_minimum_seconds FROM classes WHERE id = $1',
      [id]
    );
    const minSecs = classes[0]?.slide_minimum_seconds ?? 30;
    const elapsed = (Date.now() - new Date(prog.slide_started_at).getTime()) / 1000;

    if (!isInteractiveSlideEvent && elapsed < minSecs) {
      const falta = Math.ceil(minSecs - elapsed);
      res.status(429).json({
        error: `Aguarde mais ${falta} segundo(s) para avançar`,
        required_seconds: minSecs,
        elapsed_seconds: Math.floor(elapsed),
        remaining_seconds: falta,
      });
      return;
    }

    // Para aulas interativas, a métrica é o avanço de slides confirmado pelo sistema.
    // Para o leitor online padrão, preserva-se o tempo mínimo por slide.
    const timeOnSlide = isInteractiveSlideEvent ? minSecs : Math.min(Math.floor(elapsed), minSecs);
    const newTotalTime = prog.total_time_spent_seconds + timeOnSlide;
    const nextSlide = Math.max(prog.current_slide + 1, targetSlide);

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

  try {
    const identifiers = await resolveStudentIdentifiers(identifier);

    const { rows: classes } = await pool.query(
      'SELECT online_content_type, video_duration_seconds, expected_duration_minutes FROM classes WHERE id = $1',
      [id]
    );

    if (classes.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    if (classes[0].online_content_type === 'video') {
      const prog = await findBestOnlineProgress(id, identifiers);
      const duration = prog?.video_duration_seconds || classes[0].video_duration_seconds || 0;
      if (!prog || !duration || prog.max_video_position_seconds < Math.max(0, duration - VIDEO_COMPLETE_TOLERANCE_SECONDS)) {
        res.status(400).json({ error: 'Assista ao vídeo completo antes de concluir a aula' });
        return;
      }
    }

    const existingProgress = await findBestOnlineProgress(id, identifiers);
    if (!existingProgress) {
      res.status(404).json({ error: 'Sessão não encontrada ou já concluída' });
      return;
    }

    const updateParams = classes[0].online_content_type === 'video'
      ? [existingProgress.id, classes[0].video_duration_seconds || 0]
      : [existingProgress.id];

    const updateByIdSql = classes[0].online_content_type === 'video'
      ? `UPDATE class_online_progress
         SET completed_at = COALESCE(completed_at, NOW()),
             total_time_spent_seconds = GREATEST(total_time_spent_seconds, COALESCE(video_duration_seconds, $2))
         WHERE id = $1
         RETURNING *`
      : `UPDATE class_online_progress
         SET completed_at = NOW(),
             total_time_spent_seconds = total_time_spent_seconds +
               EXTRACT(EPOCH FROM (NOW() - slide_started_at))::int
         WHERE id = $1 AND completed_at IS NULL
         RETURNING *`;

    const { rows: progress } = await pool.query(updateByIdSql, updateParams);

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
