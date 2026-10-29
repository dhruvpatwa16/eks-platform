const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// DB settings come from environment variables (set by Kubernetes later).
// With no DB_HOST the app still starts, so we can test the platform before RDS exists.
const pool = process.env.DB_HOST
  ? new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    })
  : null;

let tableReady = false;
async function ensureTable() {
  if (!pool || tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  tableReady = true;
}

async function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'database not configured' });
  try {
    await ensureTable();
    next();
  } catch (err) {
    console.error(err.message);
    res.status(503).json({ error: 'database unavailable' });
  }
}

// Health check: always 200, reports DB state (used by probes and for demos)
app.get('/health', async (req, res) => {
  let db = 'not-configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
  }
  res.json({ status: 'ok', db });
});

app.get('/tasks', requireDb, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks ORDER BY id');
  res.json(rows);
});

app.post('/tasks', requireDb, async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const { rows } = await pool.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING *', [title]);
  res.status(201).json(rows[0]);
});

app.put('/tasks/:id', requireDb, async (req, res) => {
  const { title, done } = req.body;
  const { rows } = await pool.query(
    `UPDATE tasks SET title = COALESCE($1, title), done = COALESCE($2, done)
     WHERE id = $3 RETURNING *`, [title, done, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/tasks/:id', requireDb, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM tasks WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`task-api listening on ${port}`));