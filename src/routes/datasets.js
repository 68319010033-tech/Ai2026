import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';
import { TABLES, TABLE_NAMES } from '../data/schema.js';
import { rawTablesFromFiles, rawTablesFromJson, rawTablesFromDir, parseCsv } from '../data/loader.js';
import { createDataset, getDataset, deleteDataset, listDatasets, publicDataset } from '../services/datasetStore.js';
import { startJob, publicJob } from '../services/jobs.js';
import { validate } from '../engine/validator.js';
import { toCsv } from '../utils/csv.js';
import { AppError, wrap } from '../utils/errors.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CONFIG.maxUploadMB * 1024 * 1024, files: 20 } });
const SAMPLE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sample-data/raw');
const r = Router();

r.get('/', (req, res) => res.json({ datasets: listDatasets() }));

// Upload: multipart (CSV files and/or a ZIP of CSVs)  OR  JSON body { groups:[], teachers:[], ... }
r.post('/', upload.any(), wrap(async (req, res) => {
  let raw, ignored = [];
  if (req.files?.length) ({ raw, ignored } = rawTablesFromFiles(req.files));
  else if (req.is('application/json')) raw = rawTablesFromJson(req.body);
  else throw new AppError(400, 'Send multipart files (CSV or ZIP) or a JSON body containing the tables.');
  if (!Object.keys(raw).length) throw new AppError(400, `No recognised tables found. Expected file names: ${TABLE_NAMES.map((t) => t + '.csv').join(', ')}.`);
  const rec = createDataset(raw, { name: req.body?.name || req.files?.[0]?.originalname || 'Uploaded dataset', source: 'upload' });
  res.status(rec.report.ok ? 201 : 422).json({ ...publicDataset(rec), ignoredFiles: ignored, report: rec.report, preflight: rec.preflight });
}));

// Bundled sample (deliberately dirty raw data -> shows the cleaning report)
r.post('/sample', wrap(async (req, res) => {
  const rec = createDataset(rawTablesFromDir(SAMPLE_DIR), { name: 'Sample - Smart Campus MOCK-60-01', source: 'sample' });
  res.status(201).json({ ...publicDataset(rec), report: rec.report, preflight: rec.preflight });
}));

r.get('/:id', wrap(async (req, res) => { const rec = getDataset(req.params.id); res.json({ ...publicDataset(rec), preflight: rec.preflight }); }));
r.get('/:id/report', wrap(async (req, res) => res.json(getDataset(req.params.id).report)));
r.get('/:id/preflight', wrap(async (req, res) => {
  const rec = getDataset(req.params.id);
  if (!rec.preflight) throw new AppError(422, 'Dataset has blocking errors; pre-flight is unavailable.', { errors: rec.report.errors });
  res.json(rec.preflight);
}));
r.delete('/:id', wrap(async (req, res) => { getDataset(req.params.id); deleteDataset(req.params.id); res.status(204).end(); }));

// Preview a cleaned table
r.get('/:id/preview/:table', wrap(async (req, res) => {
  const rec = getDataset(req.params.id);
  if (!TABLES[req.params.table]) throw new AppError(404, `Unknown table. Use one of: ${TABLE_NAMES.join(', ')}.`);
  const rows = rec.dataset[req.params.table];
  const limit = Math.min(Number(req.query.limit) || 50, 500), offset = Number(req.query.offset) || 0;
  res.json({ table: req.params.table, columns: Object.keys(TABLES[req.params.table].columns), total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit) });
}));

// Download cleaned data as a ZIP of CSVs
r.get('/:id/cleaned.zip', wrap(async (req, res) => {
  const rec = getDataset(req.params.id);
  const zip = new AdmZip();
  for (const t of TABLE_NAMES) zip.addFile(`${t}.csv`, Buffer.from(toCsv(rec.dataset[t], Object.keys(TABLES[t].columns))));
  res.type('application/zip').attachment(`cleaned_data_${rec.id}.zip`).send(zip.toBuffer());
}));

// Start solving (async job)
r.post('/:id/solve', wrap(async (req, res) => {
  const rec = getDataset(req.params.id);
  const b = req.body || {};
  const num = (v, name, min, max) => { if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new AppError(400, `${name} must be a number between ${min} and ${max}.`); return n; };
  const options = {
    timeLimitSec: num(b.timeLimitSec, 'timeLimitSec', 1, CONFIG.solver.maxTimeLimitSec),
    seed: num(b.seed, 'seed', 0, 2 ** 31),
    optimizeSec: num(b.optimizeSec, 'optimizeSec', 0, CONFIG.solver.maxTimeLimitSec),
    optimize: b.optimize === undefined ? undefined : Boolean(b.optimize),
  };
  Object.keys(options).forEach((k) => options[k] === undefined && delete options[k]);
  res.status(202).json(publicJob(startJob(rec, options)));
}));

// Validate an externally produced solution.csv (multipart "file" or JSON { assignments: [...] })
r.post('/:id/validate-solution', upload.single('file'), wrap(async (req, res) => {
  const rec = getDataset(req.params.id);
  if (!rec.report.ok) throw new AppError(422, 'Dataset has blocking errors.');
  let rows;
  if (req.file) rows = parseCsv(req.file.buffer.toString('utf8'));
  else if (Array.isArray(req.body?.assignments)) rows = req.body.assignments;
  else throw new AppError(400, 'Send a CSV file in field "file" or JSON { "assignments": [...] }.');
  const need = ['offering_id', 'session_no', 'day', 'start_period', 'room_id'];
  if (rows.length && need.some((c) => !(c in rows[0]))) throw new AppError(400, `Solution must have columns: ${need.join(',')}`);
  const assignments = rows.map((x) => ({ offering_id: String(x.offering_id).trim().toUpperCase(), session_no: Number(x.session_no), day: String(x.day).trim().toUpperCase(), start_period: Number(x.start_period), room_id: String(x.room_id).trim().toUpperCase() }));
  res.json(validate(rec.dataset, assignments));
}));

export default r;
