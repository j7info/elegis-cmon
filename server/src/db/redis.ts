import Redis from 'ioredis';

const isProduction = process.env.NODE_ENV === 'production';
const redisPassword = process.env.REDIS_PASSWORD;

if (isProduction && !redisPassword) {
  throw new Error('REDIS_PASSWORD é obrigatória em produção.');
}

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: redisPassword || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

export default redis;
