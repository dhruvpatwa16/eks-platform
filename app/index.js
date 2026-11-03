const express = require('express');
const { Pool } = require('pg');
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

const app = express();
app.use(express.json());

const dbConfigured = Boolean(process.env.DB_HOST);
let poolPromise = null;

// Builds the DB pool. If DB_SECRET_ARN is set, the username and password are
// read from AWS Secrets Manager using the pod's temporary IAM credentials.
async function createPool() {
  let user = process.env.DB_USER;
  let password = process.env.DB_PASSWORD;

  if (process.env.DB_SECRET_ARN) {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const out = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
    );
    const secret = JSON.parse(out.SecretString);
    user = secret.username;
    password = secret.password;
  }

  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user,
    password,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

// Created lazily and cached. If it fails, the next request tries again,
// so the app still starts when the database or secret isn't reachable yet.
function getPool() {
  if (!dbConfigured) return Promise.resolve(null);
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

let tableReady = false;
async function ensureTable(pool) {
  if (tableReady) return;
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
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ error: 'database not configured' });
    await ensureTable(pool);
    req.pool = pool;
    next();
  } catch (err) {
    console.error(err.message);
    res.status(503).json({ error: 'database unavailable' });
  }
}

// Passes errors from async handlers to the error handler below
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Health check: always 200, reports the database state
app.get('/health', async (req, res) => {
  if (!dbConfigured) return res.json({ status: 'ok', db: 'not-configured' });
  try {
    const pool = await getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    console.error(err.message);
    res.json({ status: 'ok', db: 'down' });
  }
});

app.get('/tasks', requireDb, wrap(async (req, res) => {
  const { rows } = await req.pool.query('SELECT * FROM tasks ORDER BY id');
  res.json(rows);
}));

app.post('/tasks', requireDb, wrap(async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const { rows } = await req.pool.query(
    'INSERT INTO tasks (title) VALUES ($1) RETURNING *', [title]);
  res.status(201).json(rows[0]);
}));

app.put('/tasks/:id', requireDb, wrap(async (req, res) => {
  const { title, done } = req.body;
  const { rows } = await req.pool.query(
    `UPDATE tasks SET title = COALESCE($1, title), done = COALESCE($2, done)
     WHERE id = $3 RETURNING *`, [title, done, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

app.delete('/tasks/:id', requireDb, wrap(async (req, res) => {
  const { rowCount } = await req.pool.query(
    'DELETE FROM tasks WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
}));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'internal error' });
});

app.get('/version', (req, res) => {
  res.json({ version: 'v2', deployedBy: 'argo-cd' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`task-api listening on ${port}`));