import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailableProfiles } from './userProfiles.js';

test('professor pode alternar entre o papel principal e o modo aluno', () => {
  assert.deepEqual(getAvailableProfiles('PROFESSOR'), ['PROFESSOR', 'ALUNO']);
});

test('aluno possui somente o modo aluno', () => {
  assert.deepEqual(getAvailableProfiles('ALUNO'), ['ALUNO']);
});

test('administrador e coordenacao tambem recebem o modo aluno', () => {
  assert.deepEqual(getAvailableProfiles('ADMIN'), ['ADMIN', 'ALUNO']);
  assert.deepEqual(getAvailableProfiles('COORDENADOR'), ['COORDENADOR', 'ALUNO']);
});

test('papel ausente recebe o modo aluno como alternativa segura', () => {
  assert.deepEqual(getAvailableProfiles(null), ['ALUNO']);
  assert.deepEqual(getAvailableProfiles('DESCONHECIDO'), ['ALUNO']);
});
