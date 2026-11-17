import assert from 'node:assert/strict';
import test from 'node:test';
import { getEnrollmentBlock } from './courseEnrollment.js';

test('permite inscrição em curso aberto que o usuário não ministra', () => {
  assert.equal(getEnrollmentBlock({ enrollment_open: true, managed_by_user: false }), null);
});

test('impede nova inscrição no próprio curso', () => {
  assert.deepEqual(
    getEnrollmentBlock({ enrollment_open: true, managed_by_user: true }),
    { status: 409, error: 'Você não pode se inscrever em um curso que ministra' },
  );
});

test('preserva as respostas para curso fechado ou inexistente', () => {
  assert.equal(getEnrollmentBlock(undefined)?.status, 404);
  assert.equal(getEnrollmentBlock({ enrollment_open: false, managed_by_user: false })?.status, 403);
});
