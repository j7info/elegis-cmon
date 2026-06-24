import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { normalizeIdentifier } from '../lib/identifier.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
const attendanceSteps = ['start', 'middle', 'end'] as const;
type AttendanceStep = typeof attendanceSteps[number];

function isAttendanceStep(step: string): step is AttendanceStep {
  return attendanceSteps.includes(step as AttendanceStep);
}

function stepScanColumn(step: AttendanceStep) {
  return `scan_${step}`;
}

function stepQrColumn(step: AttendanceStep) {
  return `qr_${step}_at`;
}

async function registerAttendance(classId: string, step: AttendanceStep, rawIdentifier: string) {
  const identifierText = String(rawIdentifier).trim();
  const cleanIdentifier = normalizeIdentifier(identifierText);
  const matriculaCandidate = identifierText.toUpperCase();

  const classResult = await pool.query('SELECT * FROM classes WHERE id = $1', [classId]);
  if (classResult.rows.length === 0) {
    return { status: 404, body: { error: 'Aula não encontrada' } };
  }

  const classData = classResult.rows[0];

  if (classData.status !== 'active') {
    return { status: 400, body: { error: 'Esta aula não está ativa no momento.' } };
  }

  const activeAt = classData[stepQrColumn(step)];
  const durationMinutes = classData.qr_duration_minutes || 10;

  if (!activeAt) {
    return { status: 400, body: { error: 'O registro de presença para essa etapa ainda não foi ativado pelo professor.' } };
  }

  const now = Date.now();
  if (now < Number(activeAt)) {
    return { status: 400, body: { error: 'O registro de presença para essa etapa ainda não foi ativado pelo professor.' } };
  }

  if (now > Number(activeAt) + (durationMinutes * 60 * 1000)) {
    return { status: 400, body: { error: 'O tempo para registro no QR Code desta etapa esgotou.' } };
  }

  const userResult = await pool.query(
    'SELECT * FROM app_users WHERE cpf = $1 OR email = $1 OR matricula = $1 OR matricula = $2',
    [cleanIdentifier, matriculaCandidate]
  );
  let user = userResult.rows.length > 0 ? userResult.rows[0] : null;

  if (!user) {
    const courseReg = await pool.query(
      'SELECT full_name as name, role as cargo, department as departamento FROM registrations WHERE course_id = $1 AND (identifier = $2 OR identifier = $3) LIMIT 1',
      [classData.course_id, cleanIdentifier, matriculaCandidate]
    );
    if (courseReg.rows.length > 0) {
      user = courseReg.rows[0];
    } else {
      return { status: 404, body: { error: 'USER_NOT_FOUND' } };
    }
  }

  const regResult = await pool.query(
    `SELECT * FROM registrations WHERE course_id = $1 AND (
      identifier = $2
      OR identifier = $3
      OR EXISTS (
        SELECT 1 FROM app_users u
        WHERE (u.cpf = $2 OR u.email = $2 OR u.matricula = $2 OR u.matricula = $3)
           AND (
             registrations.identifier = u.cpf
             OR registrations.identifier = u.email
             OR registrations.identifier = u.matricula
             OR registrations.identifier = regexp_replace(COALESCE(u.matricula, ''), '\\D', '', 'g')
           )
      )
    )`,
    [classData.course_id, cleanIdentifier, matriculaCandidate]
  );

  if (regResult.rows.length === 0) {
    return { status: 403, body: { error: 'NOT_ENROLLED', course_id: classData.course_id } };
  }

  const knownIdentifiers = Array.from(new Set(
    [cleanIdentifier, matriculaCandidate, user.cpf, user.email, user.matricula, ...regResult.rows.map((reg: any) => reg.identifier)]
      .filter(Boolean)
      .flatMap((value: string) => [value, normalizeIdentifier(value)])
  ));
  const scanColumn = stepScanColumn(step);
  const attendanceIdentifier = user.cpf || user.email
    ? normalizeIdentifier(user.cpf || user.email)
    : (user.matricula || matriculaCandidate);

  const attResult = await pool.query(
    'SELECT * FROM attendances WHERE class_id = $1 AND identifier = ANY($2::text[]) ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1',
    [classId, knownIdentifiers]
  );

  if (attResult.rows.length === 0) {
    await pool.query(
      `INSERT INTO attendances (class_id, identifier, full_name, role, department, ${scanColumn})
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [classId, attendanceIdentifier, user.name, user.cargo, user.departamento, Date.now()]
    );
  } else {
    await pool.query(
      `UPDATE attendances SET ${scanColumn} = $1, updated_at = NOW() WHERE id = $2`,
      [Date.now(), attResult.rows[0].id]
    );
  }

  return {
    status: 200,
    body: {
      message: `${user.name}, sua presença foi confirmada!`,
      full_name: user.name,
      step,
    }
  };
}

// POST /api/classes/:classId/scan/:step — Registrar presença via QR (rota PÚBLICA)
router.post('/:classId/scan/:step', async (req: Request, res: Response) => {
  const { classId, step } = req.params;
  const { identifier } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  if (!isAttendanceStep(step)) {
    res.status(400).json({ error: 'Etapa inválida' });
    return;
  }

  try {
    const result = await registerAttendance(classId, step, identifier);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Erro ao marcar presença. Tente novamente.' });
  }
});

// POST /api/classes/:classId/scan/:step/self — Registrar presença do aluno logado
router.post('/:classId/scan/:step/self', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { classId, step } = req.params;

  if (!isAttendanceStep(step)) {
    res.status(400).json({ error: 'Etapa inválida' });
    return;
  }

  try {
    const { rows } = await pool.query(
      'SELECT cpf, email, matricula FROM app_users WHERE id = $1',
      [req.user!.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const user = rows[0];
    const identifier = user.cpf || user.email || user.matricula;
    if (!identifier) {
      res.status(400).json({ error: 'Seu cadastro não possui CPF, e-mail ou matrícula para registrar presença.' });
      return;
    }

    const result = await registerAttendance(classId, step, identifier);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Self scan error:', err);
    res.status(500).json({ error: 'Erro ao marcar presença. Tente novamente.' });
  }
});

export default router;
