import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';
import { TABLE_NAMES } from './schema.js';
import { normText } from '../utils/text.js';

export function parseCsv(text) {
  return parse(text, {
    columns: (h) => h.map((x) => normText(x).toLowerCase()),
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  });
}

const tableFromName = (filename) => {
  const base = path.basename(filename).replace(/\.[^.]+$/, '').toLowerCase().trim();
  return TABLE_NAMES.find((t) => t === base) || null;
};

/** multer files -> raw tables. Accepts individual CSVs and/or ZIPs containing CSVs. */
export function rawTablesFromFiles(files) {
  const raw = {}, ignored = [];
  const add = (name, buf) => {
    const t = tableFromName(name);
    if (!t) { ignored.push(path.basename(name)); return; }
    raw[t] = parseCsv(buf.toString('utf8'));
  };
  for (const f of files) {
    if (/\.zip$/i.test(f.originalname)) {
      for (const e of new AdmZip(f.buffer).getEntries()) {
        if (!e.isDirectory && /\.csv$/i.test(e.entryName) && !e.entryName.includes('__MACOSX')) add(e.entryName, e.getData());
      }
    } else if (/\.csv$/i.test(f.originalname)) add(f.originalname, f.buffer);
    else ignored.push(f.originalname);
  }
  return { raw, ignored };
}

/** JSON body: { groups:[{...}], teachers:[...], ... } */
export function rawTablesFromJson(body) {
  const raw = {};
  for (const t of TABLE_NAMES) if (Array.isArray(body?.[t])) raw[t] = body[t];
  return raw;
}

export function rawTablesFromDir(dir) {
  const raw = {};
  for (const f of fs.readdirSync(dir)) {
    const t = tableFromName(f);
    if (t && /\.csv$/i.test(f)) raw[t] = parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return raw;
}
