import pg from 'pg';

const isProduction = process.env.NODE_ENV === 'production';
const dbPassword = process.env.DB_PASSWORD;

if (isProduction && !dbPassword) {
  throw new Error('DB_PASSWORD é obrigatória em produção.');
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'elegiscmon',
  user: process.env.DB_USER || 'elegiscmon',
  password: dbPassword || 'elegiscmon',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export default pool;
