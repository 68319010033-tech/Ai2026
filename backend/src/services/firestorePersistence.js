import { TABLE_NAMES } from '../data/schema.js';

const CHUNK_CHARS = 250_000;       // <= ~750KB in UTF-8 even for Thai text; Firestore doc limit is 1 MiB
const BATCH_OPS = 400;             // Firestore batch limit is 500
const pad = (n) => String(n).padStart(4, '0');

function split(str) {
  const parts = []; let i = 0;
  while (i < str.length) {
    let end = Math.min(i + CHUNK_CHARS, str.length);
    if (end < str.length) { const c = str.charCodeAt(end - 1); if (c >= 0xd800 && c <= 0xdbff) end--; }  // never cut a surrogate pair
    parts.push(str.slice(i, end)); i = end;
  }
  return parts.length ? parts : [''];
}

/**
 * Firestore layout (prefix default "sc_"):
 *   sc_datasets/{id}            meta + publicJson (small, listable)
 *   sc_datasets/{id}/blobs/*    dataset | report | preflight  as chunked JSON strings
 *   sc_jobs/{id}                meta + jobJson + publicJson
 *   sc_jobs/{id}/blobs/*        result (assignments, validation, stats...) as chunked JSON
 * Blobs avoid Firestore's 1 MiB doc limit, nested-array restriction and `undefined` problems.
 * Blobs are written BEFORE the meta doc, so a meta doc always points at complete data.
 */
export function createFirestorePersistence(db, prefix = 'sc_') {
  const datasets = () => db.collection(`${prefix}datasets`);
  const jobs = () => db.collection(`${prefix}jobs`);

  async function writeBlobs(ref, blobs) {
    const index = {};
    let batch = db.batch(), ops = 0;
    const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };
    for (const [key, value] of Object.entries(blobs)) {
      if (value === undefined || value === null) continue;
      const parts = split(JSON.stringify(value));
      index[key] = parts.length;
      for (let i = 0; i < parts.length; i++) {
        batch.set(ref.collection('blobs').doc(`${key}_${pad(i)}`), { key, i, data: parts[i] });
        if (++ops >= BATCH_OPS) await flush();
      }
    }
    await flush();
    return index;
  }
  async function readBlob(ref, key, n) {
    const snaps = await Promise.all(Array.from({ length: n }, (_, i) => ref.collection('blobs').doc(`${key}_${pad(i)}`).get()));
    if (snaps.some((s) => !s.exists)) throw new Error(`Stored data "${key}" is incomplete.`);
    return JSON.parse(snaps.map((s) => s.data().data).join(''));
  }
  async function deleteWithBlobs(ref) {
    const snap = await ref.collection('blobs').get();
    let batch = db.batch(), ops = 0;
    for (const d of snap.docs) { batch.delete(d.ref); if (++ops >= BATCH_OPS) { await batch.commit(); batch = db.batch(); ops = 0; } }
    if (ops) await batch.commit();
    await ref.delete();
  }
  const listPublic = async (col) => (await col.orderBy('createdAt', 'desc').limit(100).get()).docs.map((d) => JSON.parse(d.data().publicJson));

  return {
    enabled: true, name: 'firestore',

    async saveDataset(rec, pub) {
      const ref = datasets().doc(rec.id);
      const blobs = await writeBlobs(ref, { dataset: rec.dataset, report: rec.report, preflight: rec.preflight });
      await ref.set({ id: rec.id, name: rec.name, source: rec.source, createdAt: rec.createdAt, ok: rec.report.ok, publicJson: JSON.stringify(pub), blobs });
    },
    async loadDataset(id) {
      const snap = await datasets().doc(id).get();
      if (!snap.exists) return null;
      const m = snap.data(), ref = datasets().doc(id);
      const [dataset, report, preflight] = await Promise.all(['dataset', 'report', 'preflight'].map((k) => (m.blobs[k] ? readBlob(ref, k, m.blobs[k]) : null)));
      return { id: m.id, name: m.name, source: m.source, createdAt: m.createdAt, dataset, report, preflight, persisted: true };
    },
    listDatasets: () => listPublic(datasets()),
    deleteDataset: (id) => deleteWithBlobs(datasets().doc(id)),

    async saveJob(job, pub) {
      const ref = jobs().doc(job.id);
      const { result, ...rest } = job;
      let blobs = {};
      if (result) { const { preflight, ...slim } = result; blobs = await writeBlobs(ref, { result: slim }); }
      await ref.set({ id: job.id, datasetId: job.datasetId, status: job.status, createdAt: job.createdAt, jobJson: JSON.stringify(rest), publicJson: JSON.stringify(pub), blobs });
    },
    async loadJob(id) {
      const snap = await jobs().doc(id).get();
      if (!snap.exists) return null;
      const m = snap.data();
      const job = JSON.parse(m.jobJson);
      job.result = m.blobs.result ? await readBlob(jobs().doc(id), 'result', m.blobs.result) : null;
      return job;
    },
    listJobs: () => listPublic(jobs()),
    deleteJob: (id) => deleteWithBlobs(jobs().doc(id)),

    /** Import input tables stored as Firestore collections named "<prefix><table>" (groups, teachers, rooms, ...). */
    async readRawTables(tablePrefix = '') {
      const raw = {};
      for (const t of TABLE_NAMES) {
        const snap = await db.collection(`${tablePrefix}${t}`).get();
        if (!snap.empty) raw[t] = snap.docs.map((d) => d.data());
      }
      return raw;
    },
  };
}
