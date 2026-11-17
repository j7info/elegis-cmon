import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAdminUsers, summarizeAdminUsers } from './adminSettingsModel.ts';

const users = [
  { id: 1, name: 'Ana Souza', matricula: 'CMON10001', status: 'Ativo', system_role: 'ADMIN' },
  { id: 2, name: 'Bruno Lima', email: 'bruno@camara.gov.br', status: 'Ativo', system_role: 'ALUNO' },
  { id: 3, name: 'Carla Rocha', cpf: '12345678900', status: 'Inativo', system_role: 'ALUNO', is_pre_registered: true },
];

test('resume usuários ativos, pendentes e administradores', () => {
  assert.deepEqual(summarizeAdminUsers(users), {
    total: 3,
    active: 2,
    pending: 1,
    admins: 1,
  });
});

test('combina busca, papel e situação sem alterar a lista original', () => {
  const snapshot = structuredClone(users);

  assert.deepEqual(filterAdminUsers(users, 'bruno@', 'ALUNO', 'Ativo').map(user => user.id), [2]);
  assert.deepEqual(filterAdminUsers(users, '', 'TODOS', 'PENDENTE').map(user => user.id), [3]);
  assert.deepEqual(users, snapshot);
});
