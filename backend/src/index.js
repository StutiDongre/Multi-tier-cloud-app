require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const { pool, testConnection } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',   // set to CloudFront URL in production
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(morgan('dev'));

// ── Health Check ────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch { /* db not ready yet */ }

  res.json({
    status: 'ok',
    db: dbStatus,
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ── GET all tasks ────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/tasks]', err.message);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── GET single task ──────────────────────────────────────────────────────
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tasks WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── POST create task ─────────────────────────────────────────────────────
app.post('/api/tasks', async (req, res) => {
  const { title, priority = 'medium' } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!['high', 'medium', 'low'].includes(priority)) {
    return res.status(400).json({ error: 'Priority must be high | medium | low' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks (title, priority) VALUES ($1, $2) RETURNING *`,
      [title.trim().substring(0, 120), priority]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /api/tasks]', err.message);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── PATCH update task (toggle complete or update title) ──────────────────
app.patch('/api/tasks/:id', async (req, res) => {
  const { completed, title, priority } = req.body;
  const updates = [];
  const values  = [];
  let   idx     = 1;

  if (typeof completed === 'boolean') { updates.push(`completed = $${idx++}`); values.push(completed); }
  if (title)                          { updates.push(`title = $${idx++}`);     values.push(title.trim().substring(0, 120)); }
  if (priority)                       { updates.push(`priority = $${idx++}`);  values.push(priority); }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /api/tasks/:id]', err.message);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── DELETE task ──────────────────────────────────────────────────────────
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM tasks WHERE id = $1', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted', id: parseInt(req.params.id) });
  } catch (err) {
    console.error('[DELETE /api/tasks/:id]', err.message);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ─────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 TaskFlow Backend running on port ${PORT}`);
  console.log(`   ENV  : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Tasks : http://localhost:${PORT}/api/tasks\n`);
  await testConnection();
});
