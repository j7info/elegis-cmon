import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../db/redis.js';

const DEFAULT_JWT_SECRET = 'elegiscmon-dev-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (process.env.NODE_ENV === 'production' && (JWT_SECRET === DEFAULT_JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET forte e exclusivo é obrigatório em produção.');
}

export interface AuthUser {
  id: number;
  matricula: string;
  name: string;
  email: string | null;
  cargo: string | null;
  departamento: string | null;
  system_role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, matricula: user.matricula, name: user.name, system_role: user.system_role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as any }
  );
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Check if token is blacklisted (logout)
    const blacklisted = await redis.get(`bl:${token}`);
    if (blacklisted) {
      res.status(401).json({ error: 'Sessão encerrada' });
      return;
    }

    // Try cache first
    const cached = await redis.get(`session:${token}`);
    if (cached) {
      req.user = JSON.parse(cached);
      next();
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user: AuthUser = {
      id: decoded.id,
      matricula: decoded.matricula,
      name: decoded.name,
      email: decoded.email || null,
      cargo: decoded.cargo || null,
      departamento: decoded.departamento || null,
      system_role: decoded.system_role || 'ALUNO',
    };

    // Cache session for 5 minutes
    await redis.set(`session:${token}`, JSON.stringify(user), 'EX', 300);

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function isAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.system_role !== 'ADMIN') {
    res.status(403).json({ error: 'Acesso negado: Requer privilégios de Administrador' });
    return;
  }
  next();
}

export function isCourseCreatorMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const allowedRoles = ['ADMIN', 'COORDENADOR', 'PROFESSOR'];
  if (!req.user || !allowedRoles.includes(req.user.system_role)) {
    res.status(403).json({ error: 'Acesso negado: Requer privilégios para criar cursos' });
    return;
  }
  next();
}

export function isAdmin(user?: AuthUser): boolean {
  return user?.system_role === 'ADMIN';
}

export async function blacklistToken(token: string) {
  // Blacklist for 24h (same as JWT expiry)
  await redis.set(`bl:${token}`, '1', 'EX', 86400);
  await redis.del(`session:${token}`);
}

export { JWT_SECRET };
