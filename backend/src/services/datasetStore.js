import crypto from 'node:crypto';
import { cleanDataset } from '../data/cleaner.js';
import { buildModel } from '../engine/model.js';
import { preflight } from '../engine/diagnostics.js';
import { AppError } from '../utils/errors.js';

const datasets = new Map();
const MAX = 20;

export function createDataset(rawTables, { name = 'Untitled', source = 'upload' } = {}) {
  const { dataset, report } = cleanDataset(rawTables);
  let pre = null;
  if (report.ok) { try { pre = preflight(buildModel(dataset)); } catch (e) { report.errors.push({ code: 'model_error', message: e.message }); report.ok = false; } }
  const rec = { id: crypto.randomUUID().slice(0, 8), name, source, createdAt: new Date().toISOString(), dataset, report, preflight: pre };
  datasets.set(rec.id, rec);
  while (datasets.size > MAX) datasets.delete(datasets.keys().next().value);
  return rec;
}
export function getDataset(id) {
  const r = datasets.get(id);
  if (!r) throw new AppError(404, `Dataset "${id}" not found.`);
  return r;
}
export const deleteDataset = (id) => datasets.delete(id);
export const listDatasets = () => [...datasets.values()].map(publicDataset);

export function publicDataset(r) {
  return {
    id: r.id, name: r.name, source: r.source, createdAt: r.createdAt,
    ok: r.report.ok, solvable: r.report.ok && (r.preflight?.feasible ?? false),
    counts: r.report.summary.counts, expectedSessions: r.report.summary.expectedSessions, expectedPeriods: r.report.summary.expectedPeriods,
    errorCount: r.report.errors.length, warningCount: r.report.warnings.length, fixCount: r.report.fixes.length,
  };
}
