import { Worker } from 'node:worker_threads';
import crypto from 'node:crypto';
import { validate } from '../engine/validator.js';
import { AppError } from '../utils/errors.js';

const jobs = new Map();
const workers = new Map();
const MAX_JOBS = 50;
const workerUrl = new URL('../engine/worker.js', import.meta.url);

export function startJob(rec, options = {}) {
  if (!rec.report.ok) throw new AppError(422, 'Dataset has blocking errors; fix them before solving.', { errors: rec.report.errors.slice(0, 20) });
  const job = {
    id: crypto.randomUUID().slice(0, 8), datasetId: rec.id, status: 'running', options,
    progress: { phase: 'queued', percent: 0, message: 'Starting' },
    createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null,
  };
  jobs.set(job.id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);

  const worker = new Worker(workerUrl, { workerData: { dataset: rec.dataset, options } });
  workers.set(job.id, worker);
  const finish = (status) => { job.status = status; job.finishedAt = new Date().toISOString(); workers.delete(job.id); };

  worker.on('message', (m) => {
    if (m.type === 'progress') { job.progress = m.progress; return; }
    if (m.type === 'error') { job.error = m.message; finish('failed'); return; }
    const r = m.result;
    const validation = r.status === 'success' ? validate(rec.dataset, r.assignments, { groupMaxPerDay: options.groupMaxPerDay }) : null;
    job.result = { ...r, validation };
    if (r.status === 'success' && !validation.valid) { job.error = 'Internal error: solver produced a timetable that failed validation.'; finish('failed'); }
    else finish(r.status === 'success' ? 'succeeded' : r.status);       // succeeded | infeasible | not_found
    job.progress = { phase: 'done', percent: 100, message: job.status };
  });
  worker.on('error', (e) => { if (job.status === 'running') { job.error = e.message; finish('failed'); } });
  worker.on('exit', () => { workers.delete(job.id); });
  return job;
}

export function getJob(id) {
  const j = jobs.get(id);
  if (!j) throw new AppError(404, `Job "${id}" not found.`);
  return j;
}
export function cancelJob(id) {
  const j = getJob(id);
  const w = workers.get(id);
  if (w && j.status === 'running') { w.terminate(); j.status = 'cancelled'; j.finishedAt = new Date().toISOString(); j.progress = { phase: 'cancelled', percent: j.progress.percent, message: 'Cancelled by user' }; }
  return j;
}
export const removeJob = (id) => { cancelJob(id); jobs.delete(id); };
export const listJobs = () => [...jobs.values()].reverse().map(publicJob);

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
export function requireSuccess(id) {
  const j = getJob(id);
  if (j.status !== 'succeeded') throw new AppError(409, `Job is "${j.status}"; a timetable is only available for succeeded jobs.`);
  return j;
}
