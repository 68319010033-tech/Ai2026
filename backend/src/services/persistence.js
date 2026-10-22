// Pluggable storage. Default = no-op (memory only). server.js swaps in the Firestore adapter when configured.
const none = {
  enabled: false, name: 'memory',
  saveDataset: async () => {}, loadDataset: async () => null, listDatasets: async () => [], deleteDataset: async () => {},
  saveJob: async () => {}, loadJob: async () => null, listJobs: async () => [], deleteJob: async () => {},
  readRawTables: async () => { const e = new Error('Firestore is not configured on this server.'); e.status = 501; throw e; },
};
let impl = none;
export const setPersistence = (p) => { impl = p || none; };
export const persist = new Proxy({}, { get: (_, k) => impl[k] });
