import { Router, Response } from 'express';
import pool from '../db/pool.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

// GET /api/me/performance — Desempenho do aluno em todos os cursos matriculados
router.get('/performance', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Buscar CPF e email do banco (não estão no JWT)
    const { rows: userRows } = await pool.query(
      'SELECT cpf, email FROM app_users WHERE id = $1',
      [req.user!.id]
    );
    if (userRows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const user = userRows[0];

    // 1. Identificadores normalizados do usuário logado
    const cpfId = user.cpf ? normalizeIdentifier(user.cpf) : null;
    const emailId = user.email ? normalizeIdentifier(user.email) : null;
    const ids = [cpfId, emailId].filter((v): v is string => v !== null && v !== '');

    if (ids.length === 0) {
      res.json({ courses: [] });
      return;
    }

    // 2. Cursos em que o aluno está matriculado
    const { rows: courses } = await pool.query(
      `SELECT DISTINCT c.*
       FROM courses c
       INNER JOIN registrations r ON r.course_id = c.id
       WHERE r.identifier = ANY($1::text[])
       ORDER BY c.created_at DESC`,
      [ids]
    );

    if (courses.length === 0) {
      res.json({ courses: [] });
      return;
    }

    const courseIds = courses.map((c: any) => c.id);

    // 3. Aulas com presença presencial ou progresso online do próprio aluno
    const { rows: classesRaw } = await pool.query(
      `SELECT
         cl.id, cl.course_id, cl.title, cl.date, cl.type,
         cl.points_start, cl.points_middle, cl.points_end,
         CASE
           WHEN cl.type = 'online' AND op.id IS NOT NULL THEN jsonb_build_object(
             'source', 'online',
             'present', op.completed_at IS NOT NULL,
             'justification', CASE WHEN op.completed_at IS NOT NULL THEN 100 ELSE NULL END,
             'completed_at', op.completed_at,
             'total_time_spent_seconds', op.total_time_spent_seconds
           )
           WHEN cl.type <> 'online' AND a.id IS NOT NULL THEN jsonb_build_object(
             'source', 'presential',
             'present', (a.scan_start IS NOT NULL OR a.scan_middle IS NOT NULL OR a.scan_end IS NOT NULL),
             'scan_start', a.scan_start,
             'scan_middle', a.scan_middle,
             'scan_end', a.scan_end,
             'justification', a.justification
           )
           ELSE NULL
         END AS att_data
       FROM classes cl
       LEFT JOIN LATERAL (
         SELECT *
         FROM attendances
         WHERE class_id = cl.id AND identifier = ANY($2::text[])
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) a ON TRUE
       LEFT JOIN LATERAL (
         SELECT *
         FROM class_online_progress
         WHERE class_id = cl.id AND identifier = ANY($2::text[])
         ORDER BY completed_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) op ON TRUE
       WHERE cl.course_id = ANY($1::int[])
       ORDER BY cl.course_id, cl.date, cl.id`,
      [courseIds, ids]
    );

    const classIds = classesRaw.map((cl: any) => cl.id);

    // 4. Notas das avaliações
    const { rows: evalScores } = await pool.query(
      `WITH eval_totals AS (
         SELECT evaluation_id, SUM(points)::int AS total_possible
         FROM questions
         GROUP BY evaluation_id
       ),
       legacy_scores AS (
         SELECT
           e.id AS evaluation_id,
           e.class_id,
           e.title AS evaluation_title,
           COALESCE(SUM(CASE WHEN alt.is_correct THEN q.points ELSE 0 END), 0)::int AS total_score,
           COALESCE(et.total_possible, 0)::int AS total_possible,
           ep.justification,
           NULL::int AS percentage,
           ROW_NUMBER() OVER (
             PARTITION BY e.id
             ORDER BY COALESCE(SUM(CASE WHEN alt.is_correct THEN q.points ELSE 0 END), 0) DESC, ep.id DESC
           ) AS rn
         FROM evaluation_participants ep
         JOIN evaluations e ON e.id = ep.evaluation_id
         LEFT JOIN eval_totals et ON et.evaluation_id = e.id
         LEFT JOIN student_answers sa ON sa.participant_id = ep.id
         LEFT JOIN alternatives alt ON sa.alternative_id = alt.id
         LEFT JOIN questions q ON sa.question_id = q.id
         WHERE e.class_id = ANY($1::int[])
           AND e.type <> 'online'
           AND ep.identifier = ANY($2::text[])
         GROUP BY e.id, e.class_id, e.title, ep.justification, ep.identifier, ep.id, et.total_possible
       ),
       online_scores AS (
         SELECT
           e.id AS evaluation_id,
           e.class_id,
           e.title AS evaluation_title,
           oat.total_score::int AS total_score,
           oat.total_possible::int AS total_possible,
           ep.justification,
           oat.percentage::int AS percentage,
           ROW_NUMBER() OVER (
             PARTITION BY e.id
             ORDER BY oat.percentage DESC, oat.total_score DESC, oat.completed_at DESC
           ) AS rn
         FROM online_evaluation_attempts oat
         JOIN evaluation_participants ep ON ep.id = oat.participant_id
         JOIN evaluations e ON e.id = oat.evaluation_id
         WHERE e.class_id = ANY($1::int[])
           AND e.type = 'online'
           AND oat.status = 'completed'
           AND ep.identifier = ANY($2::text[])
       )
       SELECT * FROM legacy_scores WHERE rn = 1
       UNION ALL
       SELECT * FROM online_scores WHERE rn = 1`,
      [classIds, ids]
    );

    // 5. Montar resposta
    const classesByCourse = new Map<number, any[]>();
    for (const cl of classesRaw) {
      if (!classesByCourse.has(cl.course_id)) classesByCourse.set(cl.course_id, []);
      classesByCourse.get(cl.course_id)!.push(cl);
    }

    const evalsByClass = new Map<number, any[]>();
    for (const ev of evalScores) {
      if (!evalsByClass.has(ev.class_id)) evalsByClass.set(ev.class_id, []);
      evalsByClass.get(ev.class_id)!.push(ev);
    }

    const result = courses.map((course: any) => {
      const courseClasses = classesByCourse.get(course.id) || [];

      let totalClasses = 0;
      let attendedClasses = 0;
      let totalPossiblePoints = 0;
      let totalEarnedPoints = 0;

      const classesData = courseClasses.map((cl: any) => {
        totalClasses++;

        const att = cl.att_data;
        const present = att?.present === true;
        const justVal: number | null = att?.justification ?? null;

        const ptsStart = cl.points_start ?? 40;
        const ptsMiddle = cl.points_middle ?? 30;
        const ptsEnd = cl.points_end ?? 30;
        const classTotalPts = ptsStart + ptsMiddle + ptsEnd;
        totalPossiblePoints += classTotalPts;

        let earned = 0;
        if (justVal != null) {
          earned = Math.round((classTotalPts * justVal) / 100);
        } else if (cl.type === 'online') {
          earned = present ? classTotalPts : 0;
        } else if (att) {
          if (att.scan_start != null && Number(att.scan_start) > 0) earned += ptsStart;
          if (att.scan_middle != null && Number(att.scan_middle) > 0) earned += ptsMiddle;
          if (att.scan_end != null && Number(att.scan_end) > 0) earned += ptsEnd;
        }
        if (earned > 0) attendedClasses++;
        totalEarnedPoints += earned;

        // Avaliações desta aula
        const classEvals = evalsByClass.get(cl.id) || [];
        const evaluations = classEvals.map((ev: any) => {
          const maxPts = ev.total_possible || 0;
          let score: number;
          if (ev.justification != null) {
            score = Math.round((maxPts * ev.justification) / 100);
          } else {
            score = ev.total_score || 0;
          }
          const pct = maxPts > 0 ? Math.round((score / maxPts) * 100) : 0;

          return {
            evaluation_id: ev.evaluation_id,
            title: ev.evaluation_title,
            score,
            max_score: maxPts,
            percentage: pct,
            justification: ev.justification,
          };
        });

        return {
          id: cl.id,
          title: cl.title,
          date: cl.date,
          order_index: cl.order_index,
          attendance: att
            ? {
                present,
                justification: justVal,
                source: att.source,
                earned_points: earned,
                max_points: classTotalPts,
                percentage: classTotalPts > 0 ? Math.round((earned / classTotalPts) * 100) : 0,
                total_time_spent_seconds: att.total_time_spent_seconds ?? null,
                completed_at: att.completed_at ?? null,
              }
            : null,
          evaluation_count: evaluations.length,
          evaluations,
        };
      });

      // Totais do curso
      const attendancePct = totalClasses > 0
        ? Math.round((attendedClasses / totalClasses) * 100)
        : 0;

      const allEvals = courseClasses.flatMap(cl => evalsByClass.get(cl.id) || []);
      let evalSum = 0;
      let evalCount = 0;
      for (const ev of allEvals) {
        const maxPts = ev.total_possible || 0;
        let score: number;
        if (ev.justification != null) {
          score = Math.round((maxPts * ev.justification) / 100);
        } else {
          score = ev.total_score || 0;
        }
        const pct = maxPts > 0 ? Math.round((score / maxPts) * 100) : 0;
        evalSum += pct;
        evalCount++;
      }

      const avgEval = evalCount > 0 ? Math.round(evalSum / evalCount) : null;

      // Aprovação pela presença (75% dos pontos = mínimo para certificado)
      const approved = totalPossiblePoints > 0
        ? (totalEarnedPoints / totalPossiblePoints) * 100 >= 75
        : false;

      return {
        id: course.id,
        title: course.title,
        total_hours: course.total_hours,
        created_at: course.created_at,
        overall: {
          total_classes: totalClasses,
          classes_attended: attendedClasses,
          attendance_percentage: attendancePct,
          total_evaluations: evalCount,
          average_evaluation_score: avgEval,
          approved,
        },
        classes: classesData,
      };
    });

    res.json({ courses: result });
  } catch (err) {
    console.error('Performance error:', err);
    res.status(500).json({ error: 'Erro ao buscar desempenho' });
  }
});

export default router;
