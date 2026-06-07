import { Request } from 'express';

export function getAppBaseUrl(req: Request): string {
  const configuredUrl = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  const corsOrigin = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .find(origin => origin && origin !== '*');

  if (corsOrigin) {
    return corsOrigin.replace(/\/$/, '');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('PUBLIC_APP_URL ou CORS_ORIGIN explícito é obrigatório para links externos em produção.');
  }

  return `${req.protocol}://${req.get('host')}`;
}
