import crypto from 'node:crypto';
import { cleanDataset } from '../data/cleaner.js';
import { buildModel } from '../engine/model.js';
import { preflight } from '../engine/diagnostics.js';
import { AppError } from '../utils/errors.js';
import { persist } from './persistence.js';

// Memory is a hot cache; Firestore (when enabled) is the source of truth that survives restarts.
const cache = new Map();
const MAX_CACHED = 20;
const remember = (rec) => { cache.delete(rec.id); cache.set(rec.id, rec); while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value); };

export async function createDataset(rawTables, { name = 'Untitled', source = 'upload' } = {}) {
  const { dataset, report } = cleanDataset(rawTables);
  let pre = null;
  if (report.ok) { try { pre = preflight(buildModel(dataset)); } catch (e) { report.errors.push({ code: 'model_error', message: e.message }); report.ok = false; } }
  const rec = { id: crypto.randomUUID().slice(0, 8), name, source, createdAt: new Date().toISOString(), dataset, report, preflight: pre, persisted: false };
  remember(rec);
  if (persist.enabled) {
    try { await persist.saveDataset(rec, publicDataset({ ...rec, persisted: true })); rec.persisted = true; }
    catch (e) { console.error('[persist] saveDataset failed:', e.message); rec.persistError = e.message; }
  }
  return rec;
}

export async function getDataset(id) {
  let rec = cache.get(id);
  if (!rec) { rec = await persist.loadDataset(id); if (rec) remember(rec); }
  if (!rec) throw new AppError(404, `Dataset "${id}" not found.`);
  return rec;
}

export async function deleteDataset(id) {
  cache.delete(id);
  await persist.deleteDataset(id);
}

export async function listDatasets() {
  const merged = new Map();
  try { for (const p of await persist.listDatasets()) merged.set(p.id, p); } catch (e) { console.error('[persist] listDatasets failed:', e.message); }
  for (const rec of cache.values()) merged.set(rec.id, publicDataset(rec));
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicDataset(r) {
  return {
    id: r.id, name: r.name, source: r.source, createdAt: r.createdAt,
    ok: r.report.ok, solvable: r.report.ok && (r.preflight?.feasible ?? false), persisted: Boolean(r.persisted),
    counts: r.report.summary.counts, expectedSessions: r.report.summary.expectedSessions, expectedPeriods: r.report.summary.expectedPeriods,
    errorCount: r.report.errors.length, warningCount: r.report.warnings.length, fixCount: r.report.fixes.length,
    ...(r.persistError ? { persistError: r.persistError } : {}),
  };
}

export const _clearCacheForTests = () => cache.clear();
