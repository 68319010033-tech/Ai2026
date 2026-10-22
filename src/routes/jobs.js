import { Router } from 'express';
import { getJob, listJobs, publicJob, cancelJob, removeJob, requireSuccess } from '../services/jobs.js';
import { getDataset } from '../services/datasetStore.js';
import { validate } from '../engine/validator.js';
import { buildEntries, filterEntries, listKeys, gridFor, computeStats, VIEWS } from '../services/timetable.js';
import { toCsv } from '../utils/csv.js';
import { AppError, wrap } from '../utils/errors.js';

const r = Router();
const ctx = (id) => { const job = requireSuccess(id); const rec = getDataset(job.datasetId); return { job, rec, entries: buildEntries(rec.dataset, job.result.assignments) }; };

r.get('/', (req, res) => res.json({ jobs: listJobs() }));
r.get('/:id', wrap(async (req, res) => res.json(publicJob(getJob(req.params.id)))));       // poll this for progress
r.delete('/:id', wrap(async (req, res) => { getJob(req.params.id); removeJob(req.params.id); res.status(204).end(); }));
r.post('/:id/cancel', wrap(async (req, res) => res.json(publicJob(cancelJob(req.params.id)))));

r.get('/:id/result', wrap(async (req, res) => { const { job } = ctx(req.params.id); res.json({ status: job.status, assignments: job.result.assignments, validation: job.result.validation, stats: job.result.stats }); }));
r.get('/:id/validation', wrap(async (req, res) => { const { job, rec } = ctx(req.params.id); res.json(validate(rec.dataset, job.result.assignments, { groupMaxPerDay: job.options.groupMaxPerDay })); }));
r.get('/:id/stats', wrap(async (req, res) => { const { job, rec, entries } = ctx(req.params.id); res.json(computeStats(rec.dataset, entries, job.result.stats)); }));

// flat, filterable list: ?group=G01&teacher=T01&room=R05&day=MON&course=C101&q=text&limit=&offset=
r.get('/:id/entries', wrap(async (req, res) => {
  const { entries } = ctx(req.params.id);
  const f = filterEntries(entries, req.query);
  const limit = Math.min(Number(req.query.limit) || 500, 1000), offset = Number(req.query.offset) || 0;
  res.json({ total: f.length, offset, limit, entries: f.slice(offset, offset + limit) });
}));

// timetable views: /timetable/group  -> keys for a dropdown;  /timetable/group/G01 -> grid
const checkView = (v) => { if (!VIEWS.includes(v)) throw new AppError(404, `View must be one of: ${VIEWS.join(', ')}.`); };
r.get('/:id/timetable/:view', wrap(async (req, res) => { checkView(req.params.view); const { rec, entries } = ctx(req.params.id); res.json({ view: req.params.view, keys: listKeys(rec.dataset, entries, req.params.view) }); }));
r.get('/:id/timetable/:view/:key', wrap(async (req, res) => {
  checkView(req.params.view);
  const { rec, entries } = ctx(req.params.id);
  const key = req.params.key.toUpperCase();
  if (!listKeys(rec.dataset, entries, req.params.view).some((k) => k.key === key)) throw new AppError(404, `${req.params.view} "${key}" not found.`);
  res.json(gridFor(rec.dataset, entries, req.params.view, key));
}));

// exports
r.get('/:id/export/solution.csv', wrap(async (req, res) => {          // exact schema required by the challenge, no BOM
  const { job } = ctx(req.params.id);
  res.type('text/csv').attachment('solution.csv').send(toCsv(job.result.assignments, ['offering_id', 'session_no', 'day', 'start_period', 'room_id']));
}));
r.get('/:id/export/solution.json', wrap(async (req, res) => { const { job } = ctx(req.params.id); res.attachment('solution.json').json(job.result.assignments); }));
r.get('/:id/export/timetable.csv', wrap(async (req, res) => {          // human-readable, Excel-friendly (UTF-8 BOM)
  const { entries } = ctx(req.params.id);
  const cols = ['day', 'start_period', 'end_period', 'start_time', 'end_time', 'group_id', 'course_id', 'course_name', 'teacher_id', 'teacher_name', 'room_id', 'room_name', 'offering_id', 'session_no'];
  res.type('text/csv; charset=utf-8').attachment('timetable.csv').send(toCsv(filterEntries(entries, req.query), cols, { bom: true }));
}));

export default r;
