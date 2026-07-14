// API + static file server. In the container this is the single entry point:
// it serves the built React app from ../dist and persists uploads to DATA_DIR.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { buildSummary, parseFitBuffer } from './summary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', 'data');
const PORT = Number(process.env.PORT ?? 3001);
const DIST_DIR = path.join(__dirname, '..', 'dist');

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const summaryPath = (id) => path.join(DATA_DIR, `${id}.json`);
const fitPath = (id) => path.join(DATA_DIR, `${id}.fit`);
// Diary notes live as plain markdown next to the fit/summary files, so a
// future LLM-analysis step can slurp them together with the summaries.
const notePath = (id) => path.join(DATA_DIR, `${id}.note.md`);
const validId = (id) => /^[0-9a-f]{16}$/.test(id);

app.post('/api/activities', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
    // multer delivers originalname as latin1; recover UTF-8 (Japanese file names).
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const data = await parseFitBuffer(req.file.buffer);
    const summary = buildSummary(originalName, data, req.file.buffer);
    fs.writeFileSync(fitPath(summary.id), req.file.buffer);
    fs.writeFileSync(summaryPath(summary.id), JSON.stringify(summary, null, 1));
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: `FITの解析・保存に失敗しました: ${e.message}` });
  }
});

app.get('/api/activities', (_req, res) => {
  const summaries = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter((s) => s != null)
    .map((s) => ({ ...s, hasNote: fs.existsSync(notePath(s.id)) }))
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  res.json(summaries);
});

app.get('/api/activities/:id/note', (req, res) => {
  const { id } = req.params;
  if (!validId(id)) return res.status(400).json({ error: 'bad id' });
  const note = fs.existsSync(notePath(id)) ? fs.readFileSync(notePath(id), 'utf-8') : '';
  res.json({ note });
});

app.put('/api/activities/:id/note', (req, res) => {
  const { id } = req.params;
  if (!validId(id) || !fs.existsSync(summaryPath(id))) {
    return res.status(404).json({ error: 'アクティビティが見つかりません' });
  }
  const note = typeof req.body?.note === 'string' ? req.body.note : '';
  if (note.trim() === '') {
    fs.rmSync(notePath(id), { force: true });
  } else {
    fs.writeFileSync(notePath(id), note, 'utf-8');
  }
  res.json({ ok: true, hasNote: note.trim() !== '' });
});

app.get('/api/activities/:id/fit', (req, res) => {
  const { id } = req.params;
  if (!validId(id) || !fs.existsSync(fitPath(id))) {
    return res.status(404).json({ error: 'not found' });
  }
  res.type('application/octet-stream').sendFile(fitPath(id));
});

app.delete('/api/activities/:id', (req, res) => {
  const { id } = req.params;
  if (!validId(id)) return res.status(400).json({ error: 'bad id' });
  fs.rmSync(fitPath(id), { force: true });
  fs.rmSync(summaryPath(id), { force: true });
  fs.rmSync(notePath(id), { force: true });
  res.json({ ok: true });
});

// Static app (production / container). In dev, Vite serves the app and
// proxies /api here, so this is a no-op when dist doesn't exist.
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`fit-viewer server listening on :${PORT} (data: ${DATA_DIR})`);
});
