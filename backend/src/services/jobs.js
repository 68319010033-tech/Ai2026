import { Worker } from 'node:worker_threads';
import crypto from 'node:crypto';
import { validate } from '../engine/validator.js';
import { AppError } from '../utils/errors.js';
import { persist } from './persistence.js';

const jobs = new Map();       // hot cache (also the only place running jobs live)
const workers = new Map();
const MAX_CACHED = 50;
const workerUrl = new URL('../engine/worker.js', import.meta.url);

const save = (job) => {
  if (!persist.enabled) return Promise.resolve();
  return persist.saveJob(job, publicJob(job)).catch((e) => console.error(`[persist] saveJob ${job.id} failed:`, e.message));
};
const remember = (job) => {
  jobs.delete(job.id); jobs.set(job.id, job);
  for (const [id, j] of jobs) { if (jobs.size <= MAX_CACHED) break; if (j.status !== 'running') jobs.delete(id); }
};

export function startJob(rec, options = {}) {
  if (!rec.report.ok) throw new AppError(422, 'Dataset has blocking errors; fix them before solving.', { errors: rec.report.errors.slice(0, 20) });
  const job = {
    id: crypto.randomUUID().slice(0, 8), datasetId: rec.id, status: 'running', options,
    progress: { phase: 'queued', percent: 0, message: 'Starting' },
    createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null,
  };
  remember(job);
  save(job);

  const worker = new Worker(workerUrl, { workerData: { dataset: rec.dataset, options } });
  workers.set(job.id, worker);
  const finish = (status) => { job.status = status; job.finishedAt = new Date().toISOString(); workers.delete(job.id); save(job); };

  worker.on('message', (m) => {
    if (m.type === 'progress') { job.progress = m.progress; return; }
    if (m.type === 'error') { job.error = m.message; finish('failed'); return; }
    const r = m.result;
    const validation = r.status === 'success' ? validate(rec.dataset, r.assignments, { groupMaxPerDay: options.groupMaxPerDay }) : null;
    job.result = { ...r, validation };
    job.progress = { phase: 'done', percent: 100, message: r.status };
    if (r.status === 'success' && !validation.valid) { job.error = 'Internal error: solver produced a timetable that failed validation.'; finish('failed'); }
    else finish(r.status === 'success' ? 'succeeded' : r.status);       // succeeded | infeasible | not_found
  });
  worker.on('error', (e) => { if (job.status === 'running') { job.error = e.message; finish('failed'); } });
  worker.on('exit', () => { workers.delete(job.id); });
  return job;
}

export async function getJob(id) {
  let j = jobs.get(id);
  if (!j) {
    j = await persist.loadJob(id);
    if (j) {
      if (j.status === 'running') {            // loaded from storage but no worker here => the server restarted mid-run
        j.status = 'failed'; j.error = 'The server restarted while this job was running. Please run it again.';
        j.finishedAt = new Date().toISOString(); save(j);
      }
      remember(j);
    }
  }
  if (!j) throw new AppError(404, `Job "${id}" not found.`);
  return j;
}

export async function cancelJob(id) {
  const j = await getJob(id);
  const w = workers.get(id);
  if (w && j.status === 'running') {
    w.terminate(); workers.delete(id);
    j.status = 'cancelled'; j.finishedAt = new Date().toISOString();
    j.progress = { phase: 'cancelled', percent: j.progress.percent, message: 'Cancelled by user' };
    save(j);
  }
  return j;
}

export async function removeJob(id) {
  await cancelJob(id);
  jobs.delete(id);
  await persist.deleteJob(id);
}

export async function listJobs() {
  const merged = new Map();
  try { for (const p of await persist.listJobs()) merged.set(p.id, p); } catch (e) { console.error('[persist] listJobs failed:', e.message); }
  for (const j of jobs.values()) merged.set(j.id, publicJob(j));
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicJob(j) {
  const r = j.result;
  return {
    id: j.id, datasetId: j.datasetId, status: j.status, progress: j.progress, options: j.options,
    createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, error: j.error,
    summary: r ? {
      status: r.status, stats: r.stats, log: r.log,
      valid: r.validation?.valid ?? null, checks: r.validation?.checks ?? null, sessions: r.validation?.summary ?? null,
      explanation: r.explanation ?? null,
    } : null,
  };
}

export async function requireSuccess(id) {
  const j = await getJob(id);
  if (j.status !== 'succeeded') throw new AppError(409, `Job is "${j.status}"; a timetable is only available for succeeded jobs.`);
  return j;
}

export const _clearCacheForTests = () => jobs.clear();
