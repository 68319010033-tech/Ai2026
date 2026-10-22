import { Router } from 'express';
import AdmZip from 'adm-zip';
import { TABLES, TABLE_NAMES } from '../data/schema.js';
import { toCsv } from '../utils/csv.js';
import { AppError, wrap } from '../utils/errors.js';

const r = Router();
const csvFor = (name) => { const cols = Object.keys(TABLES[name].columns); return toCsv([Object.fromEntries(cols.map((c, i) => [c, TABLES[name].example[i]]))], cols); };

r.get('/', (req, res) => res.json({ tables: TABLE_NAMES.map((n) => ({ name: n, file: `${n}.csv`, required: TABLES[n].required, columns: Object.keys(TABLES[n].columns), optionalColumns: TABLES[n].optional || [], template: `/api/templates/${n}.csv` })) }));
r.get('/all.zip', (req, res) => { const z = new AdmZip(); TABLE_NAMES.forEach((n) => z.addFile(`${n}.csv`, Buffer.from(csvFor(n)))); res.type('application/zip').attachment('templates.zip').send(z.toBuffer()); });
r.get('/:file', wrap(async (req, res) => {
  const name = req.params.file.replace(/\.csv$/i, '');
  if (!TABLES[name]) throw new AppError(404, `Unknown template. Use one of: ${TABLE_NAMES.join(', ')}.`);
  res.type('text/csv').attachment(`${name}.csv`).send(csvFor(name));
}));
export default r;
