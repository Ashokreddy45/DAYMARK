import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.API_HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'daymark_db',
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
  charset: 'utf8mb4'
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', app: 'DAYMARK' });
  } catch (error) {
    res.status(503).json({ ok: false, database: 'unavailable', message: 'Check the local MySQL service and .env settings.' });
  }
});

app.get('/api/workspace', async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT workspace_json, updated_at FROM workspace_state WHERE id = 1 LIMIT 1');
    if (!rows.length) return res.json({ workspace: null, updatedAt: null });
    let workspace = rows[0].workspace_json;
    if (typeof workspace === 'string') workspace = JSON.parse(workspace);
    return res.json({ workspace, updatedAt: rows[0].updated_at });
  } catch (error) {
    console.error('[DAYMARK] MySQL read failed:', error.code || error.message);
    return res.status(503).json({ error: 'Database unavailable. DAYMARK will continue in browser storage mode.' });
  }
});

app.put('/api/workspace', async (req, res) => {
  const workspace = req.body?.workspace;
  if (!workspace || !Array.isArray(workspace.tasks) || !Array.isArray(workspace.projects)) {
    return res.status(400).json({ error: 'Invalid workspace. Expected tasks and projects arrays.' });
  }
  try {
    const json = JSON.stringify(workspace);
    await pool.execute(
      `INSERT INTO workspace_state (id, workspace_json, updated_at)
       VALUES (1, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE workspace_json = VALUES(workspace_json), updated_at = CURRENT_TIMESTAMP`,
      [json]
    );
    return res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[DAYMARK] MySQL write failed:', error.code || error.message);
    return res.status(503).json({ error: 'Database save failed. Your browser copy remains available.' });
  }
});

app.listen(port, host, () => {
  console.log(`DAYMARK local API listening at http://${host}:${port}`);
  console.log('Workspace writes are restricted to this machine by default.');
  console.log('Database connection is checked when the app requests /api/health or /api/workspace.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
