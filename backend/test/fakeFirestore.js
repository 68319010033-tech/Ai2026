// Minimal in-memory stand-in for the Firestore Admin API subset we use.
// It ENFORCES the real-world restrictions that commonly break Firestore code:
//   - doc size <= 1 MiB, no `undefined` values, no nested arrays, batch <= 500 ops.
const clone = (x) => JSON.parse(JSON.stringify(x));
function check(v, path = '') {
  if (v === undefined) throw new Error(`Firestore: undefined value at ${path}`);
  if (Array.isArray(v)) v.forEach((x, i) => { if (Array.isArray(x)) throw new Error(`Firestore: nested array at ${path}[${i}]`); check(x, `${path}[${i}]`); });
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => check(x, `${path}.${k}`));
}
class Doc {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Col(this.db, `${this.path}/${name}`); }
  async set(data) {
    check(data);
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > 1_048_576) throw new Error(`Firestore: document ${this.path} exceeds 1 MiB`);
    this.db.store.set(this.path, JSON.parse(json));
  }
  async get() { const d = this.db.store.get(this.path); return { exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), ref: this }; }
  async delete() { this.db.store.delete(this.path); }
}
class Col {
  constructor(db, path, order, max) { this.db = db; this.path = path; this._order = order; this._max = max; }
  doc(id) { return new Doc(this.db, `${this.path}/${id}`); }
  orderBy(field, dir = 'asc') { return new Col(this.db, this.path, { field, dir }, this._max); }
  limit(n) { return new Col(this.db, this.path, this._order, n); }
  async get() {
    let docs = [...this.db.store.entries()]
      .filter(([p]) => p.startsWith(this.path + '/') && !p.slice(this.path.length + 1).includes('/'))
      .map(([p, d]) => ({ id: p.split('/').pop(), ref: new Doc(this.db, p), data: () => clone(d), _d: d }));
    if (this._order) { const { field, dir } = this._order; docs.sort((a, b) => (a._d[field] < b._d[field] ? -1 : a._d[field] > b._d[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
    if (this._max) docs = docs.slice(0, this._max);
    return { docs, empty: docs.length === 0 };
  }
}
export class FakeFirestore {
  constructor() { this.store = new Map(); }
  collection(path) { return new Col(this, path); }
  batch() {
    const ops = [];
    return {
      set: (ref, data) => ops.push(() => ref.set(data)),
      delete: (ref) => ops.push(() => ref.delete()),
      commit: async () => { if (ops.length > 500) throw new Error('Firestore: batch exceeds 500 operations'); for (const f of ops) await f(); },
    };
  }
}
