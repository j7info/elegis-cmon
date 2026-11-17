import assert from 'node:assert/strict';
import test from 'node:test';
import { maskIdentifier } from './identifier.ts';

test('oculta CPF, e-mail e matrícula em visualizações públicas', () => {
  assert.equal(maskIdentifier('017.123.456-00'), '017.***.***-00');
  assert.equal(maskIdentifier('aluno@camara.gov.br'), 'a***@camara.gov.br');
  assert.equal(maskIdentifier('CMON10010'), 'CMON*****');
  assert.equal(maskIdentifier(null), 'Não informado');
});
