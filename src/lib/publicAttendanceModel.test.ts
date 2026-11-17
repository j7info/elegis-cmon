import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildScanReturnPath,
  evaluateAttendanceWindow,
  getAttendanceSteps,
  getSafePublicReturnPath,
} from './publicAttendanceModel.ts';

test('mantém a janela aberta somente durante o período configurado', () => {
  const now = 1_000_000;
  const classData = { status: 'active', qr_duration_minutes: 10, qr_start_at: now - 60_000 };

  assert.equal(evaluateAttendanceWindow(classData, 'start', now).state, 'open');
  assert.equal(evaluateAttendanceWindow(classData, 'start', now + 10 * 60_000).state, 'expired');
});

test('distingue aula inativa, janela ainda não aberta e etapa inválida', () => {
  assert.equal(evaluateAttendanceWindow({ status: 'finished' }, 'start').state, 'inactive');
  assert.equal(evaluateAttendanceWindow({ status: 'active' }, 'end').state, 'not-open');
  assert.equal(evaluateAttendanceWindow({ status: 'active', type: 'practical' }, 'middle').state, 'invalid');
  assert.deepEqual(getAttendanceSteps('practical'), ['start', 'end']);
});

test('constrói e aceita somente retornos para uma leitura de presença', () => {
  assert.equal(buildScanReturnPath('12', 'middle'), '/s/12/middle');
  assert.equal(getSafePublicReturnPath('/s/12/middle'), '/s/12/middle');
  assert.equal(getSafePublicReturnPath('https://example.com'), '');
  assert.equal(getSafePublicReturnPath('//example.com/s/12/start'), '');
});
