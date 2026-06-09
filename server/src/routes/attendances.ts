import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { normalizeIdentifier } from '../lib/identifier.js';

const router = Router();

// POST /api/classes/:classId/scan/:step — Registrar presença via QR (rota PÚBLICA)
router.post('/:classId/scan/:step', async (req: Request, res: Response) => {
  const { classId, step } = req.params;
  const { identifier } = req.body;

  if (!identifier?.trim()) {
    res.status(400).json({ error: 'Identificador é obrigatório' });
    return;
  }

  if (!['start', 'middle', 'end'].includes(step)) {
    res.status(400).json({ error: 'Etapa inválida' });
    return;
  }

  const cleanIdentifier = normalizeIdentifier(identifier);

  try {
    // 1. Get class data
    const classResult = await pool.query('SELECT * FROM classes WHERE id = $1', [classId]);
    if (classResult.rows.length === 0) {
      res.status(404).json({ error: 'Aula não encontrada' });
      return;
    }

    const classData = classResult.rows[0];

    if (classData.status !== 'active') {
      res.status(400).json({ error: 'Esta aula não está ativa no momento.' });
      return;
    }

    // 2. Validate QR is active and not expired
    const qrColumn = `qr_${step}_at`;
    const activeAt = classData[qrColumn];
    const durationMinutes = classData.qr_duration_minutes || 10;

    if (!activeAt) {
      res.status(400).json({ error: 'O registro de presença para essa etapa ainda não foi ativado pelo professor.' });
      return;
    }

    if (Date.now() > Number(activeAt) + (durationMinutes * 60 * 1000)) {
      res.status(400).json({ error: 'O tempo para registro no QR Code desta etapa esgotou.' });
      return;
    }

    // 3. Verifica se o usuário existe no sistema
    const userResult = await pool.query('SELECT * FROM app_users WHERE cpf = $1 OR email = $1', [cleanIdentifier]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }
    const user = userResult.rows[0];

    // 4. Verifica se está inscrito no curso
    // Se o identifier do aluno (email) for diferente do usado no registro
    // (CPF), cruza via app_users.
    const regResult = await pool.query(
      `SELECT * FROM registrations WHERE course_id = $1 AND (
        identifier = $2
        OR EXISTS (
          SELECT 1 FROM app_users u
          WHERE (u.cpf = $2 AND registrations.identifier = u.email)
             OR (u.email = $2 AND registrations.identifier = u.cpf)
        )
      )`,
      [classData.course_id, cleanIdentifier]
    );

    if (regResult.rows.length === 0) {
      res.status(403).json({ error: 'NOT_ENROLLED', course_id: classData.course_id });
      return;
    }

    const scanColumn = `scan_${step}`;

    // 5. Upsert attendance
    const attResult = await pool.query(
      'SELECT * FROM attendances WHERE class_id = $1 AND identifier = $2',
      [classId, cleanIdentifier]
    );

    if (attResult.rows.length === 0) {
      // Create new attendance record
      await pool.query(
        `INSERT INTO attendances (class_id, identifier, full_name, role, department, ${scanColumn})
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [classId, cleanIdentifier, user.name, user.cargo, user.departamento, Date.now()]
      );
    } else {
      // Update existing
      await pool.query(
        `UPDATE attendances SET ${scanColumn} = $1, updated_at = NOW() WHERE class_id = $2 AND identifier = $3`,
        [Date.now(), classId, cleanIdentifier]
      );
    }

    res.json({
      message: `${user.name}, sua presença foi confirmada!`,
      full_name: user.name,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Erro ao marcar presença. Tente novamente.' });
  }
});

export default router;
