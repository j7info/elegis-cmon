import { Request, Response, NextFunction } from 'express';
import redis from '../db/redis.js';

interface RateLimitOptions {
  windowMs: number;    // Window in milliseconds
  maxRequests: number; // Max requests per window
  prefix: string;      // Redis key prefix
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, prefix } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rl:${prefix}:${ip}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));

      if (current > maxRequests) {
        res.status(429).json({ error: 'Muitas requisições. Tente novamente em breve.' });
        return;
      }

      next();
    } catch (err) {
      // If Redis is down, allow the request
      console.error('Rate limit error:', err);
      next();
    }
  };
}

// Presets
export const apiLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  maxRequests: 100,
  prefix: 'api',
});

export const authLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  maxRequests: 10,
  prefix: 'auth',
});
