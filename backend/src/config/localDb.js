'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Snapshot {
  constructor(data) {
    this._data = data !== undefined ? JSON.parse(JSON.stringify(data)) : null;
  }
  exists() {
    return this._data !== null && this._data !== undefined;
  }
  val() {
    return this._data;
  }
}

class Query {
  constructor(localDb, pathStr, childKey, equalValue) {
    this.localDb = localDb;
    this.pathStr = pathStr;
    this.childKey = childKey;
    this.equalValue = equalValue;
  }

  async once(eventType) {
    if (eventType !== 'value') throw new Error(`Unsupported eventType: ${eventType}`);
    const parentVal = this.localDb.get(this.pathStr);
    if (!parentVal || typeof parentVal !== 'object') {
      return new Snapshot(null);
    }
    const matched = {};
    for (const [key, item] of Object.entries(parentVal)) {
      if (item && item[this.childKey] === this.equalValue) {
        matched[key] = item;
      }
    }
    return new Snapshot(Object.keys(matched).length > 0 ? matched : null);
  }
}

class Reference {
  constructor(localDb, pathStr, key = null) {
    this.localDb = localDb;
    this.pathStr = (pathStr || '').replace(/^\/+|\/+$/g, '');
    this.key = key || (this.pathStr ? this.pathStr.split('/').pop() : null);
  }

  orderByChild(childKey) {
    return {
      equalTo: (val) => new Query(this.localDb, this.pathStr, childKey, val),
    };
  }

  push() {
    const newKey = uuidv4().replace(/-/g, '').slice(0, 20);
    const childPath = this.pathStr ? `${this.pathStr}/${newKey}` : newKey;
    return new Reference(this.localDb, childPath, newKey);
  }

  async set(value) {
    this.localDb.set(this.pathStr, value);
    return value;
  }

  async update(updates) {
    this.localDb.update(this.pathStr, updates);
  }

  async once(eventType) {
    if (eventType !== 'value') throw new Error(`Unsupported eventType: ${eventType}`);
    const val = this.localDb.get(this.pathStr);
    return new Snapshot(val);
  }
}

class LocalDatabase {
  constructor(storageFile) {
    this.storageFile = storageFile;
    this.data = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        this.data = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
      }
    } catch {
      this.data = {};
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storageFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('[local-db] Failed to persist data:', e.message);
    }
  }

  _navigate(pathStr, create = false) {
    if (!pathStr) return { parent: null, key: null, target: this.data };
    const parts = pathStr.split('/');
    let current = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (current[p] === undefined || typeof current[p] !== 'object' || current[p] === null) {
        if (!create) return null;
        current[p] = {};
      }
      current = current[p];
    }
    const lastKey = parts[parts.length - 1];
    return { parent: current, key: lastKey, target: current[lastKey] };
  }

  get(pathStr) {
    const nav = this._navigate(pathStr, false);
    if (!nav) return null;
    return nav.target !== undefined ? nav.target : null;
  }

  set(pathStr, value) {
    if (!pathStr) {
      this.data = value || {};
    } else {
      const parts = pathStr.split('/');
      let current = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!current[p] || typeof current[p] !== 'object') current[p] = {};
        current = current[p];
      }
      current[parts[parts.length - 1]] = value !== undefined ? JSON.parse(JSON.stringify(value)) : null;
    }
    this.save();
  }

  update(pathStr, updates) {
    const nav = this._navigate(pathStr, true);
    if (nav.parent) {
      if (!nav.parent[nav.key] || typeof nav.parent[nav.key] !== 'object') {
        nav.parent[nav.key] = {};
      }
      Object.assign(nav.parent[nav.key], JSON.parse(JSON.stringify(updates)));
    }
    this.save();
  }

  ref(pathStr = '') {
    return new Reference(this, pathStr);
  }
}

module.exports = { LocalDatabase };
