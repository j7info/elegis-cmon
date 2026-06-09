import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest, isCourseCreatorMiddleware } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

async function userCanAccessEvaluation(evalId: string, userId: number, role: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM evaluations e
     JOIN classes cl ON e.class_id = cl.id
     JOIN courses c ON cl.course_id = c.id
     LEFT JOIN course_teachers ct ON c.id = ct.course_id
     WHERE e.id = $1 AND ($2 = 'ADMIN' OR cl.owner_id = $3 OR cl.auxiliary_teacher_id = $3 OR c.owner_id = $3 OR ct.teacher_id = $3)
     LIMIT 1`,
    [evalId, role, userId]
  );
  return rows.length > 0;
}

// GET /api/classes/:classId/evaluations — Listar avaliações de uma aula
router.get('/classes/:classId/evaluations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*,
        (SELECT COUNT(*) FROM questions WHERE evaluation_id = e.id)::int AS question_count,
        (SELECT COUNT(*) FROM evaluation_participants WHERE evaluation_id = e.id)::int AS participant_count
       FROM evaluations e
       WHERE e.class_id = $1
       ORDER BY e.created_at DESC`,
      [req.params.classId]
    );
    res.json(rows);
  } catch (err) {
    console.error('List evaluations error:', err);
    res.status(500).json({ error: 'Erro ao listar avaliações' });
  }
});

// POST /api/classes/:classId/evaluations — Criar avaliação com perguntas
router.post('/classes/:classId/evaluations', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, question_time, questions } = req.body;

  if (!title?.trim() || !questions?.length) {
    res.status(400).json({ error: 'Título e pelo menos uma questão são obrigatórios' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Detecta se a classe é online para definir o tipo da avaliação
    const { rows: classRows } = await client.query(
      'SELECT type FROM classes WHERE id = $1',
      [req.params.classId]
    );
    const isOnline = classRows.length > 0 && classRows[0].type === 'online';
    const evalType = isOnline ? 'online' : 'presential';

    const { rows: [evalRow] } = await client.query(
      `INSERT INTO evaluations (class_id, title, question_time, type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.classId, title.trim(), question_time || 30, evalType]
    );

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim() || !q.alternatives?.length) {
        throw new Error(`Questão ${i + 1} deve ter texto e alternativas`);
      }

      const { rows: [qRow] } = await client.query(
        `INSERT INTO questions (evaluation_id, text, order_index, points)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [evalRow.id, q.text.trim(), i, q.points || 10]
      );

      for (let j = 0; j < q.alternatives.length; j++) {
        const a = q.alternatives[j];
        if (!a.text?.trim()) {
          throw new Error(`Alternativa ${j + 1} da questão ${i + 1} deve ter texto`);
        }
        await client.query(
          `INSERT INTO alternatives (question_id, text, is_correct, order_index)
           VALUES ($1, $2, $3, $4)`,
          [qRow.id, a.text.trim(), a.is_correct || false, j]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: [fullEval] } = await pool.query(
      `SELECT e.*,
        (SELECT COUNT(*) FROM questions WHERE evaluation_id = e.id)::int AS question_count,
        (SELECT COUNT(*) FROM evaluation_participants WHERE evaluation_id = e.id)::int AS participant_count
       FROM evaluations e WHERE e.id = $1`,
      [evalRow.id]
    );

    res.status(201).json(fullEval);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Create evaluation error:', err);
    res.status(500).json({ error: err.message || 'Erro ao criar avaliação' });
  } finally {
    client.release();
  }
});

// GET /api/evaluations/:id — Detalhes da avaliação com perguntas
router.get('/evaluations/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [evalRow] } = await pool.query(
      'SELECT * FROM evaluations WHERE id = $1',
      [req.params.id]
    );
    if (!evalRow) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const { rows: questions } = await pool.query(
      'SELECT * FROM questions WHERE evaluation_id = $1 ORDER BY order_index',
      [req.params.id]
    );

    const qIds = questions.map((q: any) => q.id);
    let alternatives: any[] = [];
    if (qIds.length > 0) {
      const { rows: alts } = await pool.query(
        `SELECT * FROM alternatives WHERE question_id = ANY($1::int[]) ORDER BY order_index`,
        [qIds]
      );
      alternatives = alts;
    }

    const questionsWithAlts = questions.map((q: any) => ({
      ...q,
      alternatives: alternatives.filter((a: any) => a.question_id === q.id),
    }));

    res.json({ ...evalRow, questions: questionsWithAlts });
  } catch (err) {
    console.error('Get evaluation error:', err);
    res.status(500).json({ error: 'Erro ao buscar avaliação' });
  }
});

// PUT /api/evaluations/:id — Atualizar avaliação (título, tempo, perguntas)
router.put('/evaluations/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const { title, question_time, questions } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atualiza título/tempo
      const setClauses: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let idx = 1;

      if (title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(title.trim()); }
      if (question_time !== undefined) { setClauses.push(`question_time = $${idx++}`); values.push(question_time); }

      values.push(req.params.id);
      const { rows: [updated] } = await client.query(
        `UPDATE evaluations SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      // Se veio questions, substitui todas
      if (questions && questions.length > 0) {
        await client.query('DELETE FROM questions WHERE evaluation_id = $1', [req.params.id]);

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.text?.trim() || !q.alternatives?.length) {
            throw new Error(`Questão ${i + 1} deve ter texto e alternativas`);
          }

          const { rows: [qRow] } = await client.query(
            `INSERT INTO questions (evaluation_id, text, order_index, points)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.params.id, q.text.trim(), i, q.points || 10]
          );

          for (let j = 0; j < q.alternatives.length; j++) {
            const a = q.alternatives[j];
            if (!a.text?.trim()) {
              throw new Error(`Alternativa ${j + 1} da questão ${i + 1} deve ter texto`);
            }
            await client.query(
              `INSERT INTO alternatives (question_id, text, is_correct, order_index)
               VALUES ($1, $2, $3, $4)`,
              [qRow.id, a.text.trim(), a.is_correct || false, j]
            );
          }
        }
      }

      await client.query('COMMIT');

      // Retorna avaliação completa
      const { rows: [fullEval] } = await pool.query(
        `SELECT e.*,
          (SELECT COUNT(*) FROM questions WHERE evaluation_id = e.id)::int AS question_count,
          (SELECT COUNT(*) FROM evaluation_participants WHERE evaluation_id = e.id)::int AS participant_count
         FROM evaluations e WHERE e.id = $1`,
        [req.params.id]
      );
      res.json(fullEval);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Update evaluation error:', err);
    res.status(500).json({ error: err.message || 'Erro ao atualizar avaliação' });
  }
});

// DELETE /api/evaluations/:id — Excluir avaliação
router.delete('/evaluations/:id', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }
    await pool.query('DELETE FROM evaluations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete evaluation error:', err);
    res.status(500).json({ error: 'Erro ao excluir avaliação' });
  }
});

// POST /api/evaluations/:id/start — Iniciar sala de espera (status: waiting)
router.post('/evaluations/:id/start', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE evaluations SET status = 'waiting', phase = 'waiting', current_question = 0, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error('Start evaluation error:', err);
    res.status(500).json({ error: 'Erro ao iniciar avaliação' });
  }
});

// POST /api/evaluations/:id/begin — Iniciar questionário (status: active, primeira pergunta)
router.post('/evaluations/:id/begin', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE evaluations SET status = 'active', phase = 'question', current_question = 0, phase_started_at = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [Date.now(), req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error('Begin evaluation error:', err);
    res.status(500).json({ error: 'Erro ao iniciar questionário' });
  }
});

// POST /api/evaluations/:id/next-phase — Avançar fase (question→result, result→next question, ou finalizar)
router.post('/evaluations/:id/next-phase', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const { rows: [evalRow] } = await pool.query('SELECT * FROM evaluations WHERE id = $1', [req.params.id]);
    if (!evalRow) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM questions WHERE evaluation_id = $1',
      [req.params.id]
    );
    const totalQuestions = parseInt(count as string, 10);

    let updated;
    if (evalRow.phase === 'question') {
      const { rows: [u] } = await pool.query(
        `UPDATE evaluations SET phase = 'result', phase_started_at = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [Date.now(), req.params.id]
      );
      updated = u;
    } else if (evalRow.phase === 'result') {
      const nextQuestion = evalRow.current_question + 1;
      if (nextQuestion >= totalQuestions) {
        const { rows: [u] } = await pool.query(
          `UPDATE evaluations SET status = 'completed', phase = 'completed', updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [req.params.id]
        );
        updated = u;
      } else {
        const { rows: [u] } = await pool.query(
          `UPDATE evaluations SET phase = 'question', current_question = $1, phase_started_at = $2, updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [nextQuestion, Date.now(), req.params.id]
        );
        updated = u;
      }
    } else {
      res.status(400).json({ error: 'Fase inválida para esta ação' });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error('Next phase error:', err);
    res.status(500).json({ error: 'Erro ao avançar fase' });
  }
});

// POST /api/evaluations/:id/reset — Reexibir avaliação (limpa respostas e volta pra draft)
router.post('/evaluations/:id/reset', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM student_answers WHERE evaluation_id = $1', [req.params.id]);
      await client.query('DELETE FROM evaluation_participants WHERE evaluation_id = $1', [req.params.id]);
      const { rows: [updated] } = await client.query(
        `UPDATE evaluations SET status = 'draft', phase = 'idle', current_question = 0, phase_started_at = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      await client.query('COMMIT');
      res.json(updated);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Reset evaluation error:', err);
    res.status(500).json({ error: 'Erro ao reexibir avaliação' });
  }
});

// POST /api/evaluations/:id/end — Finalizar avaliação
router.post('/evaluations/:id/end', authMiddleware, isCourseCreatorMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const canAccess = await userCanAccessEvaluation(req.params.id, req.user!.id, req.user!.system_role);
    if (!canAccess) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE evaluations SET status = 'completed', phase = 'completed', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error('End evaluation error:', err);
    res.status(500).json({ error: 'Erro ao finalizar avaliação' });
  }
});

// GET /api/evaluations/:id/session — Estado completo da sessão (para o professor)
router.get('/evaluations/:id/session', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [evalRow] } = await pool.query('SELECT * FROM evaluations WHERE id = $1', [req.params.id]);
    if (!evalRow) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const { rows: questions } = await pool.query(
      'SELECT * FROM questions WHERE evaluation_id = $1 ORDER BY order_index',
      [req.params.id]
    );

    const qIds = questions.map((q: any) => q.id);
    let alternatives: any[] = [];
    if (qIds.length > 0) {
      const { rows: alts } = await pool.query(
        `SELECT * FROM alternatives WHERE question_id = ANY($1::int[]) ORDER BY order_index`,
        [qIds]
      );
      alternatives = alts;
    }

    const { rows: participants } = await pool.query(
      'SELECT * FROM evaluation_participants WHERE evaluation_id = $1 ORDER BY joined_at',
      [req.params.id]
    );

    let currentQuestionWithAlts = null;
    let resultData = null;
    let allResults: any[] | null = null;

    const isActiveOrCompleted = evalRow.status === 'active' || evalRow.status === 'completed';

    if (isActiveOrCompleted && evalRow.current_question < questions.length) {
      const cq = questions[evalRow.current_question];
      currentQuestionWithAlts = {
        ...cq,
        alternatives: alternatives.filter((a: any) => a.question_id === cq.id),
      };

      if (evalRow.phase === 'result' || evalRow.status === 'completed') {
        const correctAlt = alternatives.find((a: any) => a.question_id === cq.id && a.is_correct);
        const { rows: answers } = await pool.query(
          `SELECT sa.*, ep.name AS participant_name, ep.identifier AS participant_identifier
           FROM student_answers sa
           JOIN evaluation_participants ep ON sa.participant_id = ep.id
           WHERE sa.evaluation_id = $1 AND sa.question_id = $2`,
          [req.params.id, cq.id]
        );
        const correctCount = answers.filter((a: any) => a.alternative_id === correctAlt?.id).length;

        const altStats = currentQuestionWithAlts.alternatives.map((alt: any) => ({
          ...alt,
          count: answers.filter((a: any) => a.alternative_id === alt.id).length,
        }));

        const correctParticipants = answers
          .filter((a: any) => a.alternative_id === correctAlt?.id)
          .map((a: any) => ({ name: a.participant_name, identifier: a.participant_identifier }));

        resultData = {
          correct_alternative: correctAlt || null,
          total_answers: answers.length,
          correct_count: correctCount,
          alternatives_stats: altStats,
          correct_participants: correctParticipants,
        };
      }
    }

    // Resultados completos para avaliação finalizada
    if (evalRow.status === 'completed') {
      allResults = [];
      for (const q of questions) {
        const qAlts = alternatives.filter((a: any) => a.question_id === q.id);
        const correctAlt = qAlts.find((a: any) => a.is_correct);
        const { rows: answers } = await pool.query(
          `SELECT sa.*, ep.name AS participant_name, ep.identifier AS participant_identifier
           FROM student_answers sa
           JOIN evaluation_participants ep ON sa.participant_id = ep.id
           WHERE sa.evaluation_id = $1 AND sa.question_id = $2`,
          [req.params.id, q.id]
        );

        allResults.push({
          question: { id: q.id, text: q.text, order_index: q.order_index, points: q.points },
          alternatives_stats: qAlts.map((alt: any) => ({
            ...alt,
            count: answers.filter((a: any) => a.alternative_id === alt.id).length,
          })),
          correct_alternative_id: correctAlt?.id || null,
          correct_count: answers.filter((a: any) => a.alternative_id === correctAlt?.id).length,
          total_answers: answers.length,
        });
      }
    }

    // Respostas do participante (para o professor saber quem já respondeu)
    let participantAnswers: any[] = [];
    if (evalRow.status === 'active' && evalRow.current_question < questions.length) {
      const cq = questions[evalRow.current_question];
      const { rows: ans } = await pool.query(
        `SELECT sa.participant_id, sa.alternative_id
         FROM student_answers sa
         WHERE sa.evaluation_id = $1 AND sa.question_id = $2`,
        [req.params.id, cq.id]
      );
      participantAnswers = ans;
    }

    // Pontuação total de cada aluno
    interface ScoreRow { participant_id: number; total_score: number; total_possible: number; justification: number | null; }
    let studentScores: ScoreRow[] = [];
    if (evalRow.status === 'completed' || evalRow.status === 'active') {
      const { rows: scores } = await pool.query(
        `SELECT
           ep.id AS participant_id,
           COALESCE(SUM(CASE WHEN a.is_correct THEN q.points ELSE 0 END), 0) AS total_score,
           COALESCE(SUM(q.points), 0) AS total_possible,
           ep.justification
         FROM evaluation_participants ep
         LEFT JOIN student_answers sa ON sa.participant_id = ep.id
         LEFT JOIN alternatives a ON sa.alternative_id = a.id
         LEFT JOIN questions q ON sa.question_id = q.id
         WHERE ep.evaluation_id = $1
         GROUP BY ep.id, ep.justification`,
        [req.params.id]
      );
      studentScores = scores;
    }

    res.json({
      evaluation: evalRow,
      questions: questions.map((q: any) => ({
        ...q,
        alternatives: alternatives.filter((a: any) => a.question_id === q.id),
      })),
      participants,
      current_question: currentQuestionWithAlts,
      result_data: resultData,
      participant_answers: participantAnswers,
      all_results: allResults,
      student_scores: studentScores,
    });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Erro ao buscar sessão' });
  }
});

// POST /api/evaluations/:id/join — Aluno entra na avaliação (público)
router.post('/evaluations/:id/join', async (req: Request, res: Response) => {
  try {
    const { name, identifier } = req.body;
    if (!name?.trim() || !identifier?.trim()) {
      res.status(400).json({ error: 'Nome e identificação (CPF/email) são obrigatórios' });
      return;
    }

    const cleanId = normalizeIdentifier(identifier);

    const { rows: [evalRow] } = await pool.query(
      'SELECT * FROM evaluations WHERE id = $1 AND status = $2',
      [req.params.id, 'waiting']
    );
    if (!evalRow) {
      res.status(400).json({ error: 'Avaliação não disponível para entrada' });
      return;
    }

    // Tenta auto-vincular com a matrícula no curso pelo CPF/email
    // Se o identifier do aluno (email) for diferente do usado no registro
    // (CPF), cruza via app_users para achar o vínculo.
    const { rows: registrations } = await pool.query(
      `SELECT r.full_name, r.identifier FROM registrations r
       JOIN classes cl ON r.class_id = cl.id
       WHERE cl.id = $1 AND (
         r.identifier = $2
         OR EXISTS (
           SELECT 1 FROM app_users u
           WHERE (u.cpf = $2 AND r.identifier = u.email)
              OR (u.email = $2 AND r.identifier = u.cpf)
         )
       )
       LIMIT 1`,
      [evalRow.class_id, cleanId]
    );

    let studentName = name.trim();
    if (registrations.length > 0) {
      studentName = registrations[0].full_name;
    }

    const { rows: [participant] } = await pool.query(
      `INSERT INTO evaluation_participants (evaluation_id, name, identifier)
       VALUES ($1, $2, $3)
       ON CONFLICT (evaluation_id, identifier) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [req.params.id, studentName, cleanId]
    );

    res.json(participant);
  } catch (err) {
    console.error('Join evaluation error:', err);
    res.status(500).json({ error: 'Erro ao entrar na avaliação' });
  }
});

// POST /api/evaluations/:id/answer — Aluno responde pergunta (público)
router.post('/evaluations/:id/answer', async (req: Request, res: Response) => {
  try {
    const { participant_id, question_id, alternative_id } = req.body;
    if (!participant_id || !question_id || !alternative_id) {
      res.status(400).json({ error: 'Dados incompletos' });
      return;
    }

    const { rows: [evalRow] } = await pool.query(
      'SELECT * FROM evaluations WHERE id = $1 AND status = $2 AND phase = $3',
      [req.params.id, 'active', 'question']
    );
    if (!evalRow) {
      res.status(400).json({ error: 'Não é permitido responder agora' });
      return;
    }

    const { rows: [existing] } = await pool.query(
      'SELECT id FROM student_answers WHERE evaluation_id = $1 AND question_id = $2 AND participant_id = $3',
      [req.params.id, question_id, participant_id]
    );
    if (existing) {
      res.status(400).json({ error: 'Você já respondeu esta pergunta' });
      return;
    }

    const { rows: [answer] } = await pool.query(
      `INSERT INTO student_answers (evaluation_id, question_id, participant_id, alternative_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, question_id, participant_id, alternative_id]
    );

    res.json(answer);
  } catch (err) {
    console.error('Answer error:', err);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

// GET /api/evaluations/:id/state — Estado atual para o aluno
router.get('/evaluations/:id/state', async (req: Request, res: Response) => {
  try {
    const { rows: [evalRow] } = await pool.query('SELECT * FROM evaluations WHERE id = $1', [
      req.params.id,
    ]);
    if (!evalRow) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const participantId = req.query.participant_id as string;

    if (evalRow.status === 'waiting') {
      const { rows: qCount } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM questions WHERE evaluation_id = $1',
        [req.params.id]
      );
      res.json({
        status: 'waiting',
        evaluation: { id: evalRow.id, title: evalRow.title, question_count: qCount[0]?.count || 0 },
      });
      return;
    }

    if (evalRow.status === 'completed') {
      res.json({ status: 'completed', evaluation: { id: evalRow.id, title: evalRow.title } });
      return;
    }

    if (evalRow.status === 'active') {
      const { rows: questions } = await pool.query(
        'SELECT * FROM questions WHERE evaluation_id = $1 ORDER BY order_index',
        [req.params.id]
      );

      if (evalRow.current_question >= questions.length) {
        res.json({ status: 'completed', evaluation: { id: evalRow.id, title: evalRow.title } });
        return;
      }

      const cq = questions[evalRow.current_question];

      const totalQuestions = questions.length;

      if (evalRow.phase === 'question') {
        const { rows: alternatives } = await pool.query(
          `SELECT id, text, order_index FROM alternatives
           WHERE question_id = $1 ORDER BY order_index`,
          [cq.id]
        );

        let myAnswer = null;
        if (participantId) {
          const { rows: ans } = await pool.query(
            `SELECT alternative_id FROM student_answers
             WHERE evaluation_id = $1 AND question_id = $2 AND participant_id = $3`,
            [req.params.id, cq.id, participantId]
          );
          if (ans.length > 0) myAnswer = ans[0].alternative_id;
        }

        res.json({
          status: 'active',
          phase: 'question',
          evaluation: { id: evalRow.id, title: evalRow.title, question_count: totalQuestions },
          question: { id: cq.id, text: cq.text, order_index: cq.order_index, alternatives },
          phase_started_at: evalRow.phase_started_at,
          question_time: evalRow.question_time,
          my_answer: myAnswer,
        });
      } else if (evalRow.phase === 'result') {
        const { rows: alternatives } = await pool.query(
          `SELECT * FROM alternatives WHERE question_id = $1 ORDER BY order_index`,
          [cq.id]
        );

        let myAnswer = null;
        let gotCorrect = false;
        if (participantId) {
          const { rows: ans } = await pool.query(
            `SELECT sa.alternative_id, a.is_correct
             FROM student_answers sa
             JOIN alternatives a ON sa.alternative_id = a.id
             WHERE sa.evaluation_id = $1 AND sa.question_id = $2 AND sa.participant_id = $3`,
            [req.params.id, cq.id, participantId]
          );
          if (ans.length > 0) {
            myAnswer = ans[0].alternative_id;
            gotCorrect = ans[0].is_correct;
          }
        }

        const correctAlt = alternatives.find((a: any) => a.is_correct);

        res.json({
          status: 'active',
          phase: 'result',
          evaluation: { id: evalRow.id, title: evalRow.title, question_count: totalQuestions },
          question: {
            id: cq.id,
            text: cq.text,
            order_index: cq.order_index,
            alternatives: alternatives.map((a: any) => ({
              id: a.id,
              text: a.text,
              order_index: a.order_index,
              is_correct: a.is_correct,
            })),
          },
          my_answer: myAnswer,
          got_correct: gotCorrect,
          correct_alternative_id: correctAlt?.id || null,
        });
      }
    }
  } catch (err) {
    console.error('Get state error:', err);
    res.status(500).json({ error: 'Erro ao buscar estado' });
  }
});

// PUT /api/evaluations/:evaluationId/participants/:participantId/justify
router.put('/evaluations/:evaluationId/participants/:participantId/justify', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { justification } = req.body;
    if (justification == null || justification < 0 || justification > 100) {
      res.status(400).json({ error: 'justification (0-100) é obrigatório' });
      return;
    }

    const { rows: [participant] } = await pool.query(
      `UPDATE evaluation_participants SET justification = $1 WHERE id = $2 RETURNING *`,
      [justification, req.params.participantId]
    );

    if (!participant) {
      res.status(404).json({ error: 'Participante não encontrado' });
      return;
    }

    res.json(participant);
  } catch (err) {
    console.error('Justify evaluation error:', err);
    res.status(500).json({ error: 'Erro ao justificar avaliação' });
  }
});

// ─── Online Evaluation ─────────────────────────────────────────────────────

// POST /api/evaluations/:id/online/start — Aluno inicia avaliação online
// (verifica se concluiu slides com ≥60% de presença)
router.post('/evaluations/:id/online/start', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    // Verifica se a avaliação existe e é online
    const { rows: evals } = await pool.query(
      `SELECT e.*, cl.type AS class_type, cl.expected_duration_minutes
       FROM evaluations e
       JOIN classes cl ON e.class_id = cl.id
       WHERE e.id = $1`,
      [id]
    );
    if (evals.length === 0) {
      res.status(404).json({ error: 'Avaliação não encontrada' });
      return;
    }

    const evaluation = evals[0];
    if (evaluation.class_type !== 'online') {
      res.status(400).json({ error: 'Esta avaliação não é de uma aula online' });
      return;
    }
    if (evaluation.status !== 'draft' && evaluation.status !== 'waiting') {
      res.status(400).json({ error: 'Avaliação não disponível' });
      return;
    }

    // Verifica se o aluno concluiu a aula online com ≥60% de presença
    const { rows: progress } = await pool.query(
      `SELECT * FROM class_online_progress
       WHERE class_id = $1 AND identifier = $2 AND completed_at IS NOT NULL`,
      [evaluation.class_id, cleanIdentifier]
    );

    if (progress.length === 0) {
      res.status(403).json({ error: 'Conclua a leitura dos slides antes de fazer a avaliação' });
      return;
    }

    const prog = progress[0];
    const expectedMin = evaluation.expected_duration_minutes || 30;
    const presencePct = Math.min(100, Math.round((prog.total_time_spent_seconds / 60 / expectedMin) * 100));

    if (presencePct < 60) {
      res.status(403).json({
        error: `Presença insuficiente (${presencePct}%). Mínimo de 60% para realizar a avaliação.`,
        presence_percentage: presencePct,
      });
      return;
    }

    // Cria/retorna participante
    const { rows: [participant] } = await pool.query(
      `INSERT INTO evaluation_participants (evaluation_id, identifier, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (evaluation_id, identifier) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [id, cleanIdentifier, prog.full_name]
    );

    res.json({
      participant,
      presence_percentage: presencePct,
    });
  } catch (err) {
    console.error('Online evaluation start error:', err);
    res.status(500).json({ error: 'Erro ao iniciar avaliação' });
  }
});

// GET /api/evaluations/:id/online/questions — Retorna perguntas para o aluno
router.get('/evaluations/:id/online/questions', async (req: Request, res: Response) => {
  const { id } = req.params;
  const identifier = req.query.identifier as string;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    // Verifica participante
    const { rows: participants } = await pool.query(
      `SELECT ep.*, e.type, e.status
       FROM evaluation_participants ep
       JOIN evaluations e ON e.id = ep.evaluation_id
       WHERE ep.evaluation_id = $1 AND ep.identifier = $2`,
      [id, cleanIdentifier]
    );

    if (participants.length === 0) {
      res.status(404).json({ error: 'Participante não encontrado. Inicie a avaliação primeiro.' });
      return;
    }

    const participant = participants[0];
    if (participant.type !== 'online') {
      res.status(400).json({ error: 'Avaliação não é online' });
      return;
    }

    // Verifica se já respondeu
    const { rows: existingAnswers } = await pool.query(
      'SELECT question_id, alternative_id FROM student_answers WHERE participant_id = $1',
      [participant.id]
    );

    if (existingAnswers.length > 0) {
      // Já respondeu — retorna resultado
      const totalScore = existingAnswers.reduce((sum, a) => sum + (a.is_correct ? 1 : 0), 0);
      res.json({
        already_answered: true,
        total_score: totalScore,
      });
      return;
    }

    // Busca perguntas com alternativas
    const { rows: questions } = await pool.query(
      `SELECT q.id, q.text, q.points, q.order_index,
              json_agg(
                json_build_object('id', a.id, 'text', a.text, 'order_index', a.order_index)
                ORDER BY a.order_index
              ) AS alternatives
       FROM questions q
       LEFT JOIN alternatives a ON a.question_id = q.id
       WHERE q.evaluation_id = $1
       GROUP BY q.id, q.text, q.points, q.order_index
       ORDER BY q.order_index`,
      [id]
    );

    res.json({ questions });
  } catch (err) {
    console.error('Online questions error:', err);
    res.status(500).json({ error: 'Erro ao buscar perguntas' });
  }
});

// POST /api/evaluations/:id/online/submit — Envia respostas da avaliação online
router.post('/evaluations/:id/online/submit', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { identifier, answers } = req.body;

  if (!identifier?.trim() || !answers || !Array.isArray(answers)) {
    res.status(400).json({ error: 'Identificador e respostas são obrigatórios' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Busca participante
    const { rows: participants } = await client.query(
      `SELECT ep.* FROM evaluation_participants ep
       WHERE ep.evaluation_id = $1 AND ep.identifier = $2
       FOR UPDATE`,
      [id, cleanIdentifier]
    );

    if (participants.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Participante não encontrado' });
      return;
    }

    const participant = participants[0];

    // Verifica se já respondeu
    const { rows: existing } = await client.query(
      'SELECT 1 FROM student_answers WHERE participant_id = $1 LIMIT 1',
      [participant.id]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Você já respondeu esta avaliação' });
      return;
    }

    // Busca todas as questões para validar as respostas
    const { rows: questions } = await client.query(
      `SELECT q.id, q.points, a.id AS correct_alternative_id
       FROM questions q
       LEFT JOIN alternatives a ON a.question_id = q.id AND a.is_correct = TRUE
       WHERE q.evaluation_id = $1`,
      [id]
    );

    const questionMap = new Map(questions.map((q: any) => [q.id, q]));

    let totalScore = 0;
    let totalPossible = 0;

    for (const ans of answers) {
      const qId = ans.question_id;
      const altId = ans.alternative_id;
      const question = questionMap.get(qId);

      if (!question) continue; // skip invalid question IDs

      const isCorrect = altId === question.correct_alternative_id;
      const points = parseInt(question.points) || 0;
      if (isCorrect) totalScore += points;
      totalPossible += points;

      await client.query(
        `INSERT INTO student_answers (participant_id, evaluation_id, question_id, alternative_id)
         VALUES ($1, $2, $3, $4)`,
        [participant.id, id, qId, altId]
      );
    }

    // Atualiza status da avaliação para completed se era waiting/draft
    // (marca como completed apenas para este participante? Não — avaliação
    //  online fica disponível e cada aluno a faz no seu ritmo)
    await client.query('COMMIT');

    const pct = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

    res.json({
      total_score: totalScore,
      total_possible: totalPossible,
      percentage: pct,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Online submit error:', err);
    res.status(500).json({ error: 'Erro ao enviar respostas' });
  } finally {
    client.release();
  }
});

export default router;
