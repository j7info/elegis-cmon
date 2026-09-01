import type { PoolClient } from 'pg';

type ClassOverrides = {
  courseId: number;
  ownerId: number;
  title?: string;
  description?: string;
  date?: string | null;
};

type CourseOverrides = {
  ownerId: number;
  title?: string;
  description?: string;
  durationHours?: number;
  startDate?: string | null;
  endDate?: string | null;
  parentCourseId?: number | null;
  isSubcourse?: boolean;
  enrollmentOpen?: boolean;
};

export async function cloneClassTemplate(
  client: PoolClient,
  sourceClassId: number,
  overrides: ClassOverrides
) {
  const { rows: [source] } = await client.query(
    'SELECT * FROM classes WHERE id = $1',
    [sourceClassId]
  );
  if (!source) throw new Error('Aula original não encontrada');

  const { rows: [newClass] } = await client.query(
    `INSERT INTO classes (
       course_id, title, description, date, status, qr_duration_minutes, owner_id,
       auxiliary_teacher_id, points_start, points_middle, points_end, type,
       expected_duration_minutes, slide_minimum_seconds, presentation_url,
       online_content_type, video_url, video_provider, video_id, video_duration_seconds,
       source_class_id
     )
     VALUES (
       $1, $2, $3, $4, 'scheduled', $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18, $19,
       $20
     )
     RETURNING *`,
    [
      overrides.courseId,
      overrides.title?.trim() || source.title,
      overrides.description?.trim() || source.description || '',
      overrides.date || null,
      source.qr_duration_minutes || 10,
      overrides.ownerId,
      source.auxiliary_teacher_id,
      source.points_start ?? 40,
      source.points_middle ?? 30,
      source.points_end ?? 30,
      source.type || 'presential',
      source.expected_duration_minutes,
      source.slide_minimum_seconds,
      source.presentation_url,
      source.online_content_type || 'slides',
      source.video_url,
      source.video_provider,
      source.video_id,
      source.video_duration_seconds,
      source.id,
    ]
  );

  await client.query(
    `INSERT INTO interactive_lessons (class_id, type, definition, html_url, html_content)
     SELECT $1, type, definition, html_url, html_content
     FROM interactive_lessons
     WHERE class_id = $2`,
    [newClass.id, source.id]
  );

  const { rows: evaluations } = await client.query(
    'SELECT * FROM evaluations WHERE class_id = $1 ORDER BY created_at, id',
    [source.id]
  );

  for (const evaluation of evaluations) {
    const { rows: [newEvaluation] } = await client.query(
      `INSERT INTO evaluations (class_id, title, question_time, status, type)
       VALUES ($1, $2, $3, 'draft', $4)
       RETURNING id`,
      [newClass.id, evaluation.title, evaluation.question_time, evaluation.type || 'presential']
    );

    const { rows: questions } = await client.query(
      'SELECT * FROM questions WHERE evaluation_id = $1 ORDER BY order_index, id',
      [evaluation.id]
    );

    for (const question of questions) {
      const { rows: [newQuestion] } = await client.query(
        `INSERT INTO questions (evaluation_id, text, order_index, points)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [newEvaluation.id, question.text, question.order_index, question.points ?? 10]
      );

      await client.query(
        `INSERT INTO alternatives (question_id, text, is_correct, order_index)
         SELECT $1, text, is_correct, order_index
         FROM alternatives
         WHERE question_id = $2
         ORDER BY order_index, id`,
        [newQuestion.id, question.id]
      );
    }
  }

  return newClass;
}

export async function cloneCourseTemplate(
  client: PoolClient,
  sourceCourseId: number,
  overrides: CourseOverrides
) {
  const { rows: [source] } = await client.query(
    'SELECT * FROM courses WHERE id = $1',
    [sourceCourseId]
  );
  if (!source) throw new Error('Curso original não encontrado');

  const { rows: [newCourse] } = await client.query(
    `INSERT INTO courses (
       title, description, duration_hours, owner_id, certificate_config,
       start_date, end_date, parent_course_id, is_subcourse, enrollment_open,
       source_course_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      overrides.title?.trim() || source.title,
      overrides.description?.trim() || source.description || '',
      overrides.durationHours ?? source.duration_hours ?? 0,
      overrides.ownerId,
      source.certificate_config,
      overrides.startDate || null,
      overrides.endDate || null,
      overrides.parentCourseId ?? null,
      overrides.isSubcourse ?? false,
      overrides.enrollmentOpen ?? false,
      source.id,
    ]
  );

  const { rows: classes } = await client.query(
    'SELECT id FROM classes WHERE course_id = $1 ORDER BY created_at, id',
    [source.id]
  );
  for (const sourceClass of classes) {
    await cloneClassTemplate(client, sourceClass.id, {
      courseId: newCourse.id,
      ownerId: overrides.ownerId,
      date: null,
    });
  }

  return newCourse;
}
