import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAlternateStaffStudent,
  normalizeAvailableProfiles,
  profilesForRole,
  resolveActiveProfile,
} from './profileModel';

test('professor recebe os modos professor e aluno', () => {
  assert.deepEqual(profilesForRole('PROFESSOR'), ['PROFESSOR', 'ALUNO']);
  assert.equal(canAlternateStaffStudent(['PROFESSOR', 'ALUNO']), true);
});

test('aluno permanece somente no modo aluno', () => {
  assert.deepEqual(profilesForRole('ALUNO'), ['ALUNO']);
  assert.equal(canAlternateStaffStudent(['ALUNO']), false);
});

test('administrador e coordenacao tambem podem acessar como aluno', () => {
  assert.deepEqual(profilesForRole('ADMIN'), ['ADMIN', 'ALUNO']);
  assert.deepEqual(profilesForRole('COORDENADOR'), ['COORDENADOR', 'ALUNO']);
  assert.equal(canAlternateStaffStudent(['ADMIN', 'ALUNO']), true);
  assert.equal(canAlternateStaffStudent(['COORDENADOR', 'ALUNO']), true);
});

test('mantem o ultimo modo valido usado pelo professor', () => {
  assert.equal(resolveActiveProfile('PROFESSOR', ['PROFESSOR', 'ALUNO'], 'ALUNO'), 'ALUNO');
  assert.equal(resolveActiveProfile('PROFESSOR', ['PROFESSOR', 'ALUNO'], 'ADMIN'), 'PROFESSOR');
  assert.equal(resolveActiveProfile('ADMIN', ['ADMIN', 'ALUNO'], 'ALUNO'), 'ALUNO');
});

test('recupera perfis de sessoes antigas sem perder compatibilidade', () => {
  assert.deepEqual(normalizeAvailableProfiles('PROFESSOR', undefined), ['PROFESSOR', 'ALUNO']);
  assert.deepEqual(normalizeAvailableProfiles('ALUNO', ['INVALIDO']), ['ALUNO']);
});
