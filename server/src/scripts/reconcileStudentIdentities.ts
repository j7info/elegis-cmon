import pool from '../db/pool.js';
import { normalizeIdentifier } from '../lib/identifier.js';
import type { PoolClient } from 'pg';

type DbClient = PoolClient;

type UserRow = {
  id: number;
  name: string;
  cpf: string | null;
  email: string | null;
  matricula: string | null;
  cargo: string | null;
  departamento: string | null;
  is_pre_registered?: boolean;
};

type ReconcileStats = {
  mergedUsers: number;
  mergedRegistrations: number;
  mergedAttendances: number;
  mergedProgress: number;
};

function identityValues(user: Pick<UserRow, 'cpf' | 'email' | 'matricula'>): string[] {
  return Array.from(new Set(
    [user.cpf, user.email, user.matricula, user.matricula ? normalizeIdentifier(user.matricula) : null]
      .filter((value): value is string => Boolean(value))
      .map((value) => String(value).trim())
      .filter(Boolean)
  ));
}

function preferredIdentifier(user: Pick<UserRow, 'cpf' | 'email' | 'matricula'>): string {
  if (user.cpf) return normalizeIdentifier(user.cpf);
  if (user.email) return String(user.email).trim().toLowerCase();
  return String(user.matricula || '').trim().toUpperCase();
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

async function updateRegistrations(client: DbClient, sourceIds: string[], targetIdentifier: string, student: Partial<UserRow>) {
  if (sourceIds.length === 0 || !targetIdentifier) return 0;

  const updated = await client.query(
    `UPDATE registrations r
     SET identifier = $1,
         full_name = COALESCE($2, full_name),
         role = COALESCE($3, role),
         department = COALESCE($4, department)
     WHERE identifier = ANY($5::text[])
       AND NOT EXISTS (
         SELECT 1 FROM registrations existing
         WHERE existing.course_id = r.course_id AND existing.identifier = $1
       )`,
    [targetIdentifier, student.name, student.cargo, student.departamento, sourceIds]
  );

  const deleted = await client.query(
    `DELETE FROM registrations r
     WHERE identifier = ANY($1::text[])
       AND identifier <> $2
       AND EXISTS (
         SELECT 1 FROM registrations existing
         WHERE existing.course_id = r.course_id AND existing.identifier = $2
       )`,
    [sourceIds, targetIdentifier]
  );

  return (updated.rowCount || 0) + (deleted.rowCount || 0);
}

async function updateAttendances(client: DbClient, sourceIds: string[], targetIdentifier: string, student: Partial<UserRow>) {
  if (sourceIds.length === 0 || !targetIdentifier) return 0;

  const insertedTargets = await client.query(
    `UPDATE attendances a
     SET identifier = $1,
         full_name = COALESCE($2, full_name),
         role = COALESCE($3, role),
         department = COALESCE($4, department),
         updated_at = NOW()
     WHERE identifier = ANY($5::text[])
       AND NOT EXISTS (
         SELECT 1 FROM attendances existing
         WHERE existing.class_id = a.class_id AND existing.identifier = $1
       )`,
    [targetIdentifier, student.name, student.cargo, student.departamento, sourceIds]
  );

  const mergedTargets = await client.query(
    `UPDATE attendances target
     SET scan_start = COALESCE(target.scan_start, source.scan_start),
         scan_middle = COALESCE(target.scan_middle, source.scan_middle),
         scan_end = COALESCE(target.scan_end, source.scan_end),
         justification = GREATEST(COALESCE(target.justification, 0), COALESCE(source.justification, 0)),
         full_name = COALESCE($2, target.full_name),
         role = COALESCE($3, target.role),
         department = COALESCE($4, target.department),
         updated_at = NOW()
     FROM attendances source
     WHERE source.class_id = target.class_id
       AND target.identifier = $1
       AND source.identifier = ANY($5::text[])
       AND source.identifier <> $1`,
    [targetIdentifier, student.name, student.cargo, student.departamento, sourceIds]
  );

  const deleted = await client.query(
    `DELETE FROM attendances a
     WHERE identifier = ANY($1::text[])
       AND identifier <> $2
       AND EXISTS (
         SELECT 1 FROM attendances existing
         WHERE existing.class_id = a.class_id AND existing.identifier = $2
       )`,
    [sourceIds, targetIdentifier]
  );

  return (insertedTargets.rowCount || 0) + (mergedTargets.rowCount || 0) + (deleted.rowCount || 0);
}

async function updateProgress(client: DbClient, sourceIds: string[], targetIdentifier: string, student: Partial<UserRow>) {
  if (sourceIds.length === 0 || !targetIdentifier) return 0;

  const insertedTargets = await client.query(
    `UPDATE class_online_progress p
     SET identifier = $1,
         full_name = COALESCE($2, full_name)
     WHERE identifier = ANY($3::text[])
       AND NOT EXISTS (
         SELECT 1 FROM class_online_progress existing
         WHERE existing.class_id = p.class_id AND existing.identifier = $1
       )`,
    [targetIdentifier, student.name, sourceIds]
  );

  const mergedTargets = await client.query(
    `UPDATE class_online_progress target
     SET current_slide = GREATEST(target.current_slide, source.current_slide),
         total_time_spent_seconds = GREATEST(target.total_time_spent_seconds, source.total_time_spent_seconds),
         completed_at = COALESCE(target.completed_at, source.completed_at),
         max_video_position_seconds = GREATEST(
           COALESCE(target.max_video_position_seconds, 0),
           COALESCE(source.max_video_position_seconds, 0)
         ),
         video_duration_seconds = COALESCE(target.video_duration_seconds, source.video_duration_seconds),
         full_name = COALESCE($2, target.full_name)
     FROM class_online_progress source
     WHERE source.class_id = target.class_id
       AND target.identifier = $1
       AND source.identifier = ANY($3::text[])
       AND source.identifier <> $1`,
    [targetIdentifier, student.name, sourceIds]
  );

  const deleted = await client.query(
    `DELETE FROM class_online_progress p
     WHERE identifier = ANY($1::text[])
       AND identifier <> $2
       AND EXISTS (
         SELECT 1 FROM class_online_progress existing
         WHERE existing.class_id = p.class_id AND existing.identifier = $2
       )`,
    [sourceIds, targetIdentifier]
  );

  return (insertedTargets.rowCount || 0) + (mergedTargets.rowCount || 0) + (deleted.rowCount || 0);
}

async function mergeDuplicateUsers(client: DbClient, stats: ReconcileStats) {
  const { rows } = await client.query<UserRow>(
    `SELECT id, name, cpf, email, matricula, cargo, departamento, is_pre_registered
     FROM app_users
     ORDER BY lower(trim(name)), CASE WHEN matricula IS NULL OR matricula = '' THEN 1 ELSE 0 END, id`
  );

  const groups = new Map<string, UserRow[]>();
  for (const user of rows) {
    const key = normalizeName(user.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), user]);
  }

  for (const users of groups.values()) {
    if (users.length < 2) continue;
    const target = users[0];
    const targetIdentifier = preferredIdentifier(target);

    for (const source of users.slice(1)) {
      const sourceIds = identityValues(source);
      stats.mergedRegistrations += await updateRegistrations(client, sourceIds, targetIdentifier, target);
      stats.mergedAttendances += await updateAttendances(client, sourceIds, targetIdentifier, target);
      stats.mergedProgress += await updateProgress(client, sourceIds, targetIdentifier, target);

      await client.query(
        `UPDATE app_users SET
           name = COALESCE(name, $1),
           email = COALESCE(email, $2),
           cpf = COALESCE(cpf, $3),
           cargo = COALESCE(cargo, $4),
           departamento = COALESCE(departamento, $5),
           status = 'Ativo',
           is_pre_registered = FALSE,
           updated_at = NOW()
         WHERE id = $6`,
        [source.name, source.email, source.cpf, source.cargo, source.departamento, target.id]
      );
      await client.query('DELETE FROM app_users WHERE id = $1', [source.id]);
      stats.mergedUsers++;
    }
  }
}

async function normalizeRecordsForExistingUsers(client: DbClient, stats: ReconcileStats) {
  const { rows } = await client.query<UserRow>(
    `SELECT id, name, cpf, email, matricula, cargo, departamento
     FROM app_users
     ORDER BY CASE WHEN matricula IS NULL OR matricula = '' THEN 1 ELSE 0 END, id`
  );

  for (const user of rows) {
    const ids = identityValues(user);
    const targetIdentifier = preferredIdentifier(user);
    stats.mergedRegistrations += await updateRegistrations(client, ids, targetIdentifier, user);
    stats.mergedAttendances += await updateAttendances(client, ids, targetIdentifier, user);
    stats.mergedProgress += await updateProgress(client, ids, targetIdentifier, user);
  }
}

async function canonicalUserForNameOrIdentifiers(client: DbClient, fullName: string, identifiers: string[]): Promise<UserRow | null> {
  const { rows } = await client.query<UserRow>(
    `SELECT id, name, cpf, email, matricula, cargo, departamento
     FROM app_users
     WHERE lower(trim(name)) = lower(trim($1))
        OR cpf = ANY($2::text[])
        OR regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = ANY($2::text[])
        OR lower(COALESCE(email, '')) = ANY($3::text[])
        OR matricula = ANY($2::text[])
        OR regexp_replace(COALESCE(matricula, ''), '\\D', '', 'g') = ANY($2::text[])
     ORDER BY
       CASE WHEN matricula IS NULL OR matricula = '' THEN 1 ELSE 0 END,
       CASE
         WHEN cpf = ANY($2::text[])
           OR regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = ANY($2::text[])
           OR lower(COALESCE(email, '')) = ANY($3::text[])
           OR matricula = ANY($2::text[])
           OR regexp_replace(COALESCE(matricula, ''), '\\D', '', 'g') = ANY($2::text[])
         THEN 0 ELSE 1
       END,
       id
     LIMIT 1`,
    [fullName, identifiers, identifiers.map((identifier) => identifier.toLowerCase())]
  );
  return rows[0] || null;
}

async function consolidateRegistrationsByName(client: DbClient, stats: ReconcileStats) {
  const { rows } = await client.query<{
    course_id: number;
    full_name: string;
    identifiers: string[];
  }>(
    `SELECT course_id, MIN(full_name) AS full_name, array_agg(identifier) AS identifiers
     FROM registrations
     WHERE status = 'approved'
     GROUP BY course_id, lower(trim(full_name))
     HAVING COUNT(*) > 1`
  );

  for (const group of rows) {
    const user = await canonicalUserForNameOrIdentifiers(client, group.full_name, group.identifiers);
    const targetIdentifier = user ? preferredIdentifier(user) : group.identifiers[0];
    stats.mergedRegistrations += await updateRegistrations(client, group.identifiers, targetIdentifier, user || { name: group.full_name });
  }
}

async function consolidateAttendancesByName(client: DbClient, stats: ReconcileStats) {
  const { rows } = await client.query<{
    class_id: number;
    full_name: string;
    identifiers: string[];
  }>(
    `SELECT class_id, MIN(full_name) AS full_name, array_agg(identifier) AS identifiers
     FROM attendances
     GROUP BY class_id, lower(trim(full_name))
     HAVING COUNT(*) > 1`
  );

  for (const group of rows) {
    const user = await canonicalUserForNameOrIdentifiers(client, group.full_name, group.identifiers);
    const targetIdentifier = user ? preferredIdentifier(user) : group.identifiers[0];
    stats.mergedAttendances += await updateAttendances(client, group.identifiers, targetIdentifier, user || { name: group.full_name });
  }
}

async function consolidateProgressByName(client: DbClient, stats: ReconcileStats) {
  const { rows } = await client.query<{
    class_id: number;
    full_name: string;
    identifiers: string[];
  }>(
    `SELECT class_id, MIN(full_name) AS full_name, array_agg(identifier) AS identifiers
     FROM class_online_progress
     GROUP BY class_id, lower(trim(full_name))
     HAVING COUNT(*) > 1`
  );

  for (const group of rows) {
    const user = await canonicalUserForNameOrIdentifiers(client, group.full_name, group.identifiers);
    const targetIdentifier = user ? preferredIdentifier(user) : group.identifiers[0];
    stats.mergedProgress += await updateProgress(client, group.identifiers, targetIdentifier, user || { name: group.full_name });
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const client = await pool.connect();
  const stats: ReconcileStats = {
    mergedUsers: 0,
    mergedRegistrations: 0,
    mergedAttendances: 0,
    mergedProgress: 0,
  };

  try {
    await client.query('BEGIN');
    await mergeDuplicateUsers(client, stats);
    await normalizeRecordsForExistingUsers(client, stats);
    await consolidateRegistrationsByName(client, stats);
    await consolidateAttendancesByName(client, stats);
    await consolidateProgressByName(client, stats);

    if (apply) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...stats }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Reconcile student identities error:', err);
  process.exit(1);
});
