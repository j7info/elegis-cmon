import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import authRoutes from './routes/auth.js';
import coursesRoutes from './routes/courses.js';
import classesRoutes from './routes/classes.js';
import registrationsRoutes from './routes/registrations.js';
import attendancesRoutes from './routes/attendances.js';
import certificatesRoutes from './routes/certificates.js';
import settingsRoutes from './routes/settings.js';
import usersRoutes from './routes/users.js';
import publicRoutes from './routes/public.js';
import { apiLimiter } from './middleware/rateLimit.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const BODY_LIMIT = process.env.BODY_LIMIT || '2mb';
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowWildcardCors = !isProduction && (configuredOrigins.length === 0 || configuredOrigins.includes('*'));

// ========================================
// Trust proxy — necessário para funcionar atrás
// de Nginx Proxy Manager (NPM) ou qualquer reverse proxy.
// Aceita headers: X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host
// ========================================
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || '1'));

if (isProduction && (configuredOrigins.length === 0 || configuredOrigins.includes('*'))) {
  console.warn('CORS_ORIGIN deve listar origens explícitas em produção.');
}

// ========================================
// Middleware global
// ========================================
app.use(helmet({
  // Relaxar CSP para permitir inline styles (TailwindCSS) e fontes externas
  contentSecurityPolicy: false,
  // Permitir cross-origin requests do frontend
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(compression());

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowWildcardCors || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Rate limiting global
app.use('/api', apiLimiter);

// ========================================
// Rotas da API
// ========================================
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/classes', registrationsRoutes);   // /api/classes/:classId/registrations
app.use('/api/classes', attendancesRoutes);      // /api/classes/:classId/scan/:step
app.use('/api/certificates', certificatesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);

// ========================================
// Health check
// ========================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ========================================
// Error handler global
// ========================================
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ========================================
// Start server
// ========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Backend rodando em http://0.0.0.0:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Trust proxy: enabled (para NPM/reverse proxy)`);
});

export default app;
