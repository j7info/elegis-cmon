import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAlternateTeacherStudent,
  normalizeAvailableProfiles,
  profilesForRole,
  resolveActiveProfile,
} from './profileModel';

test('professor recebe os modos professor e aluno', () => {
  assert.deepEqual(profilesForRole('PROFESSOR'), ['PROFESSOR', 'ALUNO']);
  assert.equal(canAlternateTeacherStudent(['PROFESSOR', 'ALUNO']), true);
});

test('aluno permanece somente no modo aluno', () => {
  assert.deepEqual(profilesForRole('ALUNO'), ['ALUNO']);
  assert.equal(canAlternateTeacherStudent(['ALUNO']), false);
});

test('mantem o ultimo modo valido usado pelo professor', () => {
  assert.equal(resolveActiveProfile('PROFESSOR', ['PROFESSOR', 'ALUNO'], 'ALUNO'), 'ALUNO');
  assert.equal(resolveActiveProfile('PROFESSOR', ['PROFESSOR', 'ALUNO'], 'ADMIN'), 'PROFESSOR');
});

test('recupera perfis de sessoes antigas sem perder compatibilidade', () => {
  assert.deepEqual(normalizeAvailableProfiles('PROFESSOR', undefined), ['PROFESSOR', 'ALUNO']);
  assert.deepEqual(normalizeAvailableProfiles('ALUNO', ['INVALIDO']), ['ALUNO']);
});
