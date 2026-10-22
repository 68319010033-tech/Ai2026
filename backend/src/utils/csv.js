export function toCsv(rows, columns, { bom = false } = {}) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))];
  return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}
