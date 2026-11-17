import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailableProfiles } from './userProfiles.js';

test('professor pode alternar entre os modos professor e aluno', () => {
  assert.deepEqual(getAvailableProfiles('PROFESSOR'), ['PROFESSOR', 'ALUNO']);
});

test('aluno possui somente o modo aluno', () => {
  assert.deepEqual(getAvailableProfiles('ALUNO'), ['ALUNO']);
});

test('outros papeis permanecem isolados', () => {
  assert.deepEqual(getAvailableProfiles('ADMIN'), ['ADMIN']);
  assert.deepEqual(getAvailableProfiles('COORDENADOR'), ['COORDENADOR']);
});

test('papel ausente recebe o modo aluno como alternativa segura', () => {
  assert.deepEqual(getAvailableProfiles(null), ['ALUNO']);
  assert.deepEqual(getAvailableProfiles('DESCONHECIDO'), ['ALUNO']);
});
