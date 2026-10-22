// Text normalisation helpers (BOM, full-width, Thai digits, stray spaces)
const THAI_ZERO = 0x0e50;

export function normText(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/[\uFEFF\u200B-\u200D]/g, '')
    .normalize('NFKC')                                              // Ｔ０９ -> T09
    .replace(/[\u0E50-\u0E59]/g, (c) => String(c.charCodeAt(0) - THAI_ZERO)) // ๖ -> 6
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract an integer out of things like "6.0", "20 คาบ", "๖". Returns null when impossible. */
export function toInt(v) {
  const s = normText(v);
  if (s === '') return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) ? n : null;
}

const DAY_MAP = [
  [/^MON|^จ/, 'MON'], [/^TUE|^อ/, 'TUE'], [/^WED|^พุธ|^พ(?!ฤ)/, 'WED'],
  [/^THU|^พฤ/, 'THU'], [/^FRI|^ศ/, 'FRI'], [/^SAT|^ส(?!า)/, 'SAT'], [/^SUN|^อา/, 'SUN'],
];
export function toDay(v) {
  const s = normText(v).toUpperCase();
  if (!s) return null;
  if (/^อา/.test(s)) return 'SUN';
  for (const [re, d] of DAY_MAP) if (re.test(s)) return d;
  return null;
}

/** "8.00" / "08.00" / "8:00" -> "08:00" */
export function toTime(v) {
  const s = normText(v).replace('.', ':');
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** C-103 / c 103 / C0103 -> C103  (used to repair broken foreign keys) */
export function canonId(id) {
  const s = normText(id).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^([A-Z]+)0*(\d+)$/);
  return m ? m[1] + m[2] : s;
}
export const timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
