import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMailConfig } from './mailer.js';

test('recusa configuração sem credenciais completas', () => {
  assert.throws(
    () => resolveMailConfig({
      MAIL_HOST: 'smtp.example.test',
      MAIL_USERNAME: 'notificacoes@example.test',
    }),
    /Configuração de e-mail incompleta/,
  );
});

test('mantém TLS validado por padrão e usa o remetente configurado', () => {
  const config = resolveMailConfig({
    MAIL_HOST: 'smtp.example.test',
    MAIL_PORT: '587',
    MAIL_USERNAME: 'notificacoes@example.test',
    MAIL_PASSWORD: 'test-only-password',
    MAIL_FROM_ADDRESS: 'sistema@example.test',
    MAIL_FROM_NAME: 'Elegis Teste',
  });

  assert.equal(config.transport.port, 587);
  assert.equal(config.transport.secure, false);
  assert.equal(config.transport.tls.rejectUnauthorized, true);
  assert.equal(config.fromAddress, 'sistema@example.test');
  assert.equal(config.fromName, 'Elegis Teste');
  assert.equal(config.rateLimitPerMinute, 3);
});

test('ativa conexão segura automaticamente na porta 465', () => {
  const config = resolveMailConfig({
    MAIL_HOST: 'smtp.example.test',
    MAIL_PORT: '465',
    MAIL_USERNAME: 'notificacoes@example.test',
    MAIL_PASSWORD: 'test-only-password',
  });

  assert.equal(config.transport.secure, true);
  assert.equal(config.fromAddress, 'notificacoes@example.test');
});

test('recusa porta de e-mail inválida', () => {
  assert.throws(
    () => resolveMailConfig({
      MAIL_HOST: 'smtp.example.test',
      MAIL_PORT: '70000',
      MAIL_USERNAME: 'notificacoes@example.test',
      MAIL_PASSWORD: 'test-only-password',
    }),
    /MAIL_PORT inválida/,
  );
});

test('aceita limite de envio configurado pelo provedor', () => {
  const config = resolveMailConfig({
    MAIL_HOST: 'smtp.example.test',
    MAIL_USERNAME: 'notificacoes@example.test',
    MAIL_PASSWORD: 'test-only-password',
    MAIL_RATE_LIMIT_PER_MINUTE: '3',
  });

  assert.equal(config.rateLimitPerMinute, 3);
});

test('recusa limite de envio fora da faixa segura', () => {
  assert.throws(
    () => resolveMailConfig({
      MAIL_HOST: 'smtp.example.test',
      MAIL_USERNAME: 'notificacoes@example.test',
      MAIL_PASSWORD: 'test-only-password',
      MAIL_RATE_LIMIT_PER_MINUTE: '0',
    }),
    /MAIL_RATE_LIMIT_PER_MINUTE inválida/,
  );
});
