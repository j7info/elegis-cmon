import redis from '../db/redis.js';

const WINDOW_MS = 60_000;
const RATE_LIMIT_KEY = 'mail:rate:global';

const RESERVE_QUOTA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

export interface MailQuotaResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function reserveMailQuota(limitPerMinute: number): Promise<MailQuotaResult> {
  const result = await redis.eval(
    RESERVE_QUOTA_SCRIPT,
    1,
    RATE_LIMIT_KEY,
    WINDOW_MS,
  ) as [number | string, number | string];

  const current = Number(result[0]);
  const ttlMs = Number(result[1]);

  return {
    allowed: current <= limitPerMinute,
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
  };
}
