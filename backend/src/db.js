const { Pool } = require('pg');

// ── Connection Pool ──────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'taskflow',
  user:     process.env.DB_USER     || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpass123',
  max:      10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

// ── Initialize DB schema ─────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          SERIAL PRIMARY KEY,
        title       VARCHAR(120)  NOT NULL,
        priority    VARCHAR(10)   NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('high','medium','low')),
        completed   BOOLEAN       NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    // Seed demo data only if table is empty
    const { rowCount } = await client.query('SELECT 1 FROM tasks LIMIT 1');
    if (rowCount === 0) {
      await client.query(`
        INSERT INTO tasks (title, priority) VALUES
          ('Set up S3 bucket for frontend hosting', 'high'),
          ('Configure CloudFront distribution',     'high'),
          ('Deploy Express API to EC2',             'high'),
          ('Set up PostgreSQL Docker container',    'medium'),
          ('Configure GitHub Actions CI/CD',        'medium'),
          ('Add Nginx reverse proxy on EC2',        'medium'),
          ('Test full deployment pipeline',         'low'),
          ('Write project documentation',           'low')
      `);
      console.log('✅ Database seeded with demo tasks');
    }

    console.log('✅ Database schema initialized');
  } finally {
    client.release();
  }
}

// ── Test connection & init ───────────────────────────────────────────────
async function testConnection(retries = 5) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT NOW()');
      console.log('✅ PostgreSQL connected successfully');
      await initDB();
      return true;
    } catch (err) {
      console.warn(`⚠️  DB connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 3000 * i));
      }
    }
  }
  console.error('❌ Could not connect to PostgreSQL after all retries');
  return false;
}

module.exports = { pool, testConnection };
