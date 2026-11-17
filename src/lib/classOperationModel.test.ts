import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAttendanceStages,
  getAttendanceWindowState,
  getNextAttendanceAction,
} from './classOperationModel.ts';

test('o vencimento de um QR afeta somente a janela daquele registro', () => {
  const now = 1_000_000;
  const stages = buildAttendanceStages({
    isPractical: false,
    durationMinutes: 10,
    points: { start: 40, middle: 30, end: 30 },
    activeAt: { start: now - 11 * 60 * 1000 },
    attendances: [{ scan_start: now - 10 * 60 * 1000 }],
    now,
  });

  assert.deepEqual(stages.map(stage => stage.state), ['expired', 'waiting', 'waiting']);
  assert.equal(stages[0].confirmed, 1);
  assert.equal(getNextAttendanceAction(stages), 'Abrir QR de confirmação');
});

test('identifica uma janela aberta dentro do tempo configurado', () => {
  const now = 2_000_000;
  assert.equal(getAttendanceWindowState(now - 9 * 60 * 1000, 10, now), 'open');
  assert.equal(getAttendanceWindowState(now - 10 * 60 * 1000, 10, now), 'expired');
});

test('aula prática usa somente entrada e saída', () => {
  const stages = buildAttendanceStages({
    isPractical: true,
    durationMinutes: 10,
    points: { start: 50, middle: 0, end: 50 },
    activeAt: {},
    attendances: [],
  });

  assert.deepEqual(stages.map(stage => stage.step), ['start', 'end']);
  assert.equal(getNextAttendanceAction(stages), 'Abrir QR de entrada');
});

test('indica conferência final quando todas as janelas expiraram', () => {
  const now = 3_000_000;
  const stages = buildAttendanceStages({
    isPractical: false,
    durationMinutes: 1,
    points: { start: 40, middle: 30, end: 30 },
    activeAt: { start: 1, middle: 1, end: 1 },
    attendances: [],
    now,
  });

  assert.equal(getNextAttendanceAction(stages), 'Conferir registros e concluir a aula');
});
