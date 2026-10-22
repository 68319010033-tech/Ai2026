import { TABLES, TABLE_NAMES, FOREIGN_KEYS } from './schema.js';
import { normText, toInt, toDay, toTime, canonId } from '../utils/text.js';
import { DAY_ORDER } from '../config.js';

const MAX_FIXES = 1000;

/**
 * rawTables: { tableName: [ { column: value, ... } ] }   (column names may be dirty)
 * Returns { dataset, report }. `report.errors` non-empty => dataset is NOT solvable.
 */
export function cleanDataset(rawTables) {
  const errors = [], warnings = [], fixes = [];
  let whitespaceCells = 0, droppedRows = 0;
  const addError = (code, table, message, extra = {}) => errors.push({ code, table, message, ...extra });
  const addWarn = (code, table, message, extra = {}) => warnings.push({ code, table, message, ...extra });
  const addFix = (table, line, column, from, to, rule) => {
    if (fixes.length < MAX_FIXES) fixes.push({ table, line, column, from, to, rule });
  };

  const ds = {};

  // ---------- 1) per-table type cleaning ----------
  for (const name of TABLE_NAMES) {
    const spec = TABLES[name];
    const raw = rawTables[name];
    if (!raw) {
      ds[name] = [];
      if (spec.required) addError('missing_table', name, `Required table "${name}" was not provided.`);
      continue;
    }
    const cols = Object.keys(spec.columns);
    const present = new Set(raw.length ? Object.keys(raw[0]).map((h) => normText(h).toLowerCase()) : cols);
    const missingCols = cols.filter((c) => !present.has(c) && !(spec.optional || []).includes(c));
    if (missingCols.length) {
      addError('missing_column', name, `Table "${name}" is missing column(s): ${missingCols.join(', ')}.`, { columns: missingCols });
      ds[name] = [];
      continue;
    }
    const rows = [];
    raw.forEach((r, idx) => {
      const line = idx + 2;
      const src = {};
      for (const [k, v] of Object.entries(r)) src[normText(k).toLowerCase()] = v;
      if (cols.every((c) => normText(src[c]) === '')) return; // blank row
      const out = { _line: line };
      let bad = false;
      for (const c of cols) {
        const type = spec.columns[c];
        const rawStr = src[c] === undefined || src[c] === null ? '' : String(src[c]);
        const rawTrim = rawStr.replace(/^\uFEFF/, '').trim();
        if (rawStr !== rawTrim) whitespaceCells++;
        let val;
        if (type === 'int') val = toInt(rawTrim);
        else if (type === 'day') val = toDay(rawTrim);
        else if (type === 'time') val = toTime(rawTrim);
        else if (type === 'text') val = normText(rawTrim) || null;
        else val = normText(rawTrim).toUpperCase() || null; // id | upper
        if (val === null) {
          if (rawTrim === '' && (spec.optional || []).includes(c)) { out[c] = null; continue; }
          bad = true;
          addError(rawTrim === '' ? 'missing_value' : 'invalid_value', name,
            rawTrim === '' ? `${name}.${c} is empty (line ${line}).` : `${name}.${c} has invalid value "${rawTrim}" (line ${line}).`,
            { line, column: c, value: rawTrim });
          continue;
        }
        if (String(val) !== rawTrim) {
          addFix(name, line, c, rawTrim, val,
            type === 'int' ? 'numeric-normalize' : type === 'text' ? 'text-normalize' : 'id-normalize');
        }
        out[c] = val;
      }
      if (bad) droppedRows++; else rows.push(out);
    });
    ds[name] = rows;
  }

  // ---------- 2) foreign-key repair (C-103 -> C103, T1 -> T01 ...) ----------
  const keySet = (t, c) => new Set(ds[t].map((r) => r[c]));
  const repairer = (t, c) => {
    const set = keySet(t, c);
    const byCanon = new Map();
    for (const v of set) {
      const k = canonId(v);
      byCanon.set(k, byCanon.has(k) ? null : v); // null => ambiguous
    }
    return (v) => (set.has(v) ? v : byCanon.get(canonId(v)) ?? null);
  };
  for (const [t, c, rt, rc] of FOREIGN_KEYS) {
    if (!ds[t].length) continue;
    const fix = repairer(rt, rc);
    ds[t] = ds[t].filter((row) => {
      const fixed = fix(row[c]);
      if (fixed === null) {
        addError('unknown_reference', t, `${t}.${c}="${row[c]}" (line ${row._line}) does not exist in ${rt}.${rc}.`,
          { line: row._line, column: c, value: row[c] });
        return false;
      }
      if (fixed !== row[c]) { addFix(t, row._line, c, row[c], fixed, 'fix-reference'); row[c] = fixed; }
      return true;
    });
  }
  // blocked_slots: resource_id depends on resource_type
  {
    const fixT = repairer('teachers', 'teacher_id'), fixR = repairer('rooms', 'room_id');
    ds.blocked_slots = ds.blocked_slots.filter((row) => {
      if (!['TEACHER', 'ROOM'].includes(row.resource_type)) {
        addError('invalid_value', 'blocked_slots', `blocked_slots.resource_type must be TEACHER or ROOM (line ${row._line}).`, { line: row._line });
        return false;
      }
      const fixed = (row.resource_type === 'TEACHER' ? fixT : fixR)(row.resource_id);
      if (fixed === null) {
        addError('unknown_reference', 'blocked_slots', `blocked_slots.resource_id="${row.resource_id}" (line ${row._line}) not found in ${row.resource_type === 'TEACHER' ? 'teachers' : 'rooms'}.`, { line: row._line });
        return false;
      }
      if (fixed !== row.resource_id) { addFix('blocked_slots', row._line, 'resource_id', row.resource_id, fixed, 'fix-reference'); row.resource_id = fixed; }
      return true;
    });
  }

  // ---------- 3) de-duplication ----------
  for (const name of TABLE_NAMES) {
    const spec = TABLES[name];
    const seenKey = new Map(), kept = [];
    for (const row of ds[name]) {
      const key = spec.key.map((k) => row[k]).join('|');
      const prev = seenKey.get(key);
      if (!prev) { seenKey.set(key, row); kept.push(row); continue; }
      const same = Object.keys(spec.columns).every((c) => prev[c] === row[c]);
      if (same) addWarn('duplicate_row', name, `Exact duplicate row removed from ${name} (line ${row._line} = line ${prev._line}).`, { line: row._line });
      else addError('duplicate_key', name, `${name} has conflicting rows for key ${key} (lines ${prev._line} and ${row._line}).`, { line: row._line });
    }
    ds[name] = kept;
  }

  // ---------- 4) offering.student_count: evidence-based repair ----------
  const groupById = new Map(ds.groups.map((g) => [g.group_id, g]));
  const enrolled = new Map();
  for (const e of ds.enrollments) {
    if (!enrolled.has(e.offering_id)) enrolled.set(e.offering_id, new Set());
    enrolled.get(e.offering_id).add(e.student_id);
  }
  for (const o of ds.offerings) {
    const auth = enrolled.get(o.offering_id)?.size || groupById.get(o.group_id)?.student_count || null;
    const source = enrolled.get(o.offering_id)?.size ? 'enrollments' : 'groups.student_count';
    if (auth === null) continue;
    if (o.student_count === null || o.student_count === undefined) {
      addFix('offerings', o._line, 'student_count', '', auth, 'fill-student-count');
      addWarn('student_count_filled', 'offerings', `offerings ${o.offering_id}: empty student_count filled with ${auth} (from ${source}).`, { line: o._line });
      o.student_count = auth;
    } else if (o.student_count !== auth) {
      addFix('offerings', o._line, 'student_count', o.student_count, auth, 'override-student-count');
      addWarn('student_count_overridden', 'offerings', `offerings ${o.offering_id}: student_count ${o.student_count} contradicts ${source} (${auth}); using ${auth}.`, { line: o._line });
      o.student_count = auth;
    }
  }

  // ---------- 5) logical validation ----------
  const roomTypes = new Set(ds.rooms.map((r) => r.room_type));
  const courseById = new Map(ds.courses.map((c) => [c.course_id, c]));
  const slotKey = new Set(ds.timeslots.map((t) => `${t.day}|${t.period}`));
  const days = [...new Set(ds.timeslots.map((t) => t.day))];
  for (const t of ds.timeslots) {
    if (t.start_time >= t.end_time) addError('bad_timeslot', 'timeslots', `timeslot ${t.day} P${t.period}: start_time must be before end_time.`, { line: t._line });
  }
  for (const c of ds.courses) {
    if (c.session_length < 1) addError('bad_course', 'courses', `${c.course_id}: session_length must be >= 1.`, { line: c._line });
    if (c.sessions_per_week < 1) addError('bad_course', 'courses', `${c.course_id}: sessions_per_week must be >= 1.`, { line: c._line });
    if (days.length && c.sessions_per_week > days.length) addError('bad_course', 'courses', `${c.course_id}: sessions_per_week (${c.sessions_per_week}) exceeds the number of days (${days.length}); sessions of one offering must be on different days.`, { line: c._line });
    if (!roomTypes.has(c.required_room_type)) addError('no_room_type', 'courses', `${c.course_id} needs room type ${c.required_room_type} but no such room exists.`, { line: c._line });
  }
  for (const t of ds.teachers) {
    if (t.max_periods_per_day < 1 || t.max_periods_per_week < 1) addError('bad_teacher', 'teachers', `${t.teacher_id}: period limits must be >= 1.`, { line: t._line });
    if (t.max_periods_per_week < t.max_periods_per_day) addWarn('teacher_limits', 'teachers', `${t.teacher_id}: weekly limit is lower than daily limit.`);
  }
  for (const r of ds.rooms) if (r.capacity < 1) addError('bad_room', 'rooms', `${r.room_id}: capacity must be >= 1.`, { line: r._line });
  for (const g of ds.groups) if (g.student_count < 1) addError('bad_group', 'groups', `${g.group_id}: student_count must be >= 1.`, { line: g._line });
  for (const b of ds.blocked_slots) if (!slotKey.has(`${b.day}|${b.period}`)) addWarn('blocked_outside_timeslots', 'blocked_slots', `blocked slot ${b.resource_type} ${b.resource_id} ${b.day} P${b.period} is not a valid timeslot (ignored).`, { line: b.line });
  for (const f of ds.fixed_sessions) {
    const off = ds.offerings.find((o) => o.offering_id === f.offering_id);
    const course = off && courseById.get(off.course_id);
    if (course && f.session_no > course.sessions_per_week) addError('bad_fixed', 'fixed_sessions', `${f.offering_id}: session_no ${f.session_no} > sessions_per_week (${course.sessions_per_week}).`, { line: f._line });
    if (!slotKey.has(`${f.day}|${f.start_period}`)) addError('bad_fixed', 'fixed_sessions', `${f.offering_id}: fixed slot ${f.day} P${f.start_period} is not a valid timeslot.`, { line: f._line });
  }
  const offCourseMissing = ds.offerings.filter((o) => !courseById.has(o.course_id));
  if (offCourseMissing.length) addError('unknown_reference', 'offerings', 'Some offerings reference unknown courses.');

  // ---------- 6) soft warnings ----------
  const studentsPerGroup = new Map();
  for (const s of ds.students) studentsPerGroup.set(s.group_id, (studentsPerGroup.get(s.group_id) || 0) + 1);
  for (const g of ds.groups) {
    const n = studentsPerGroup.get(g.group_id);
    if (ds.students.length && n !== g.student_count) addWarn('group_size_mismatch', 'groups', `${g.group_id}: student_count=${g.student_count} but students.csv lists ${n || 0}.`);
    if (!ds.offerings.some((o) => o.group_id === g.group_id)) addWarn('group_without_offering', 'groups', `${g.group_id} has no offerings.`);
  }
  for (const t of ds.teachers) if (!ds.offerings.some((o) => o.teacher_id === t.teacher_id)) addWarn('teacher_without_offering', 'teachers', `${t.teacher_id} has no offerings (idle teacher).`);

  // sort timeslots
  ds.timeslots.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.period - b.period);

  // strip internal line numbers from output dataset
  const dataset = {};
  for (const n of TABLE_NAMES) dataset[n] = ds[n].map(({ _line, ...rest }) => rest);

  const ruleCounts = {};
  for (const f of fixes) ruleCounts[f.rule] = (ruleCounts[f.rule] || 0) + 1;
  const sessionsTotal = dataset.offerings.reduce((s, o) => s + (courseById.get(o.course_id)?.sessions_per_week || 0), 0);
  const periodsTotal = dataset.offerings.reduce((s, o) => { const c = courseById.get(o.course_id); return s + (c ? c.sessions_per_week * c.session_length : 0); }, 0);

  return {
    dataset,
    report: {
      ok: errors.length === 0,
      errors, warnings, fixes,
      summary: {
        counts: Object.fromEntries(TABLE_NAMES.map((n) => [n, dataset[n].length])),
        expectedSessions: sessionsTotal,
        expectedPeriods: periodsTotal,
        fixesByRule: ruleCounts,
        whitespaceCellsTrimmed: whitespaceCells,
        rowsDropped: droppedRows,
      },
    },
  };
}
