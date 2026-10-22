import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeFirestore } from './fakeFirestore.js';
import { createFirestorePersistence } from '../src/services/firestorePersistence.js';
import { setPersistence } from '../src/services/persistence.js';
import * as datasets from '../src/services/datasetStore.js';
import * as jobs from '../src/services/jobs.js';
import { rawTablesFromDir } from '../src/data/loader.js';
import { TABLE_NAMES } from '../src/data/schema.js';

const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../sample-data/raw');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitDone(id, ms = 40000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { const j = await jobs.getJob(id); if (j.status !== 'running') return j; await sleep(100); }
  throw new Error('job timeout');
}
after(() => setPersistence(null));

test('dataset + job survive a "restart" (memory cache cleared) via Firestore', async () => {
  const fake = new FakeFirestore();
  setPersistence(createFirestorePersistence(fake, 't_'));

  const rec = await datasets.createDataset(rawTablesFromDir(RAW), { name: 'persist-test' });
  assert.equal(rec.persisted, true, rec.persistError);
  assert.ok(fake.store.has(`t_datasets/${rec.id}`));

  const job = jobs.startJob(rec, { timeLimitSec: 20, optimizeSec: 0.5 });
  await waitDone(job.id); await sleep(300);                         // let the async save finish
  assert.ok(fake.store.has(`t_jobs/${job.id}`));

  // simulate restart
  datasets._clearCacheForTests(); jobs._clearCacheForTests();
  const rec2 = await datasets.getDataset(rec.id);
  assert.deepEqual(rec2.dataset, rec.dataset);
  assert.equal(rec2.report.summary.expectedSessions, 88);
  const j2 = await jobs.requireSuccess(job.id);
  assert.equal(j2.result.assignments.length, 88);
  assert.equal(j2.result.validation.valid, true);

  assert.equal((await datasets.listDatasets()).length, 1);
  assert.equal((await jobs.listJobs())[0].status, 'succeeded');

  await jobs.removeJob(job.id); await datasets.deleteDataset(rec.id);
  assert.equal([...fake.store.keys()].length, 0, 'all docs + blobs deleted');
});

test('a job found "running" in storage after a restart is marked failed, not stuck', async () => {
  const fake = new FakeFirestore();
  const p = createFirestorePersistence(fake, 't_'); setPersistence(p);
  await p.saveJob({ id: 'ghost01', datasetId: 'x', status: 'running', options: {}, progress: { percent: 40 }, createdAt: new Date().toISOString(), result: null }, { id: 'ghost01', createdAt: 'x' });
  jobs._clearCacheForTests();
  const j = await jobs.getJob('ghost01');
  assert.equal(j.status, 'failed');
  assert.match(j.error, /restarted/);
});

test('large / awkward payloads are chunked (1 MiB limit, nested arrays, undefined, emoji, Thai)', async () => {
  const fake = new FakeFirestore();
  const p = createFirestorePersistence(fake, 't_');
  const big = ('สวัสดี😀' + 'ก').repeat(150_000);
  const result = { assignments: [], grid: [[1, 2], [3]], maybe: undefined, big };
  await p.saveJob({ id: 'big1', datasetId: 'd', status: 'succeeded', options: {}, progress: {}, createdAt: 'c', result }, { id: 'big1', createdAt: 'c' });
  const chunks = [...fake.store.keys()].filter((k) => k.startsWith('t_jobs/big1/blobs/'));
  assert.ok(chunks.length >= 2, 'payload was split into several docs');
  const back = await p.loadJob('big1');
  assert.equal(back.result.big, big);
  assert.deepEqual(back.result.grid, [[1, 2], [3]]);
});

test('import input tables from Firestore collections', async () => {
  const fake = new FakeFirestore();
  const p = createFirestorePersistence(fake, 't_'); setPersistence(p);
  const raw = rawTablesFromDir(RAW);
  for (const t of TABLE_NAMES) await Promise.all(raw[t].map((row, i) => fake.collection(`app_${t}`).doc(`d${i}`).set(row)));
  const imported = await p.readRawTables('app_');
  const rec = await datasets.createDataset(imported, { name: 'from-firestore', source: 'firestore' });
  assert.equal(rec.report.ok, true);
  assert.equal(rec.report.summary.expectedSessions, 88);
});
