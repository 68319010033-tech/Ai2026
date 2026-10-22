import { DAY_ORDER, CONFIG } from '../config.js';
import { timeToMin } from '../utils/text.js';

export const CONSTRAINTS = {
  C01: 'Teacher is not double-booked',
  C02: 'Room is not double-booked',
  C03: 'Group / individual students have no overlapping classes',
  C04: 'Room type matches the course and capacity fits the group',
  C05: 'Within Mon-Fri timeslots and never across the lunch break',
  C06: 'Multi-period sessions are consecutive in one day and one room',
  C07: 'All sessions scheduled exactly once (no missing / duplicate / unknown)',
  C08: 'Sessions of the same offering are on different days',
  C09: 'Teacher daily and weekly period limits',
  C10: 'Group has at most 7 periods per day',
  C11: 'Teacher blocked times and room closures respected',
  C12: 'Fixed sessions placed exactly as given',
};
const MAX_LISTED = 300;

/**
 * Independent checker of the 12 hard constraints. Works on the cleaned dataset + a list of
 * { offering_id, session_no, day, start_period, room_id } rows. Never trusts the solver.
 */
export function validate(ds, assignments, opts = {}) {
  const groupMax = opts.groupMaxPerDay ?? CONFIG.groupMaxPeriodsPerDay;
  const counts = Object.fromEntries(Object.keys(CONSTRAINTS).map((k) => [k, 0]));
  const violations = [];
  const v = (c, code, message, refs = {}) => { counts[c]++; if (violations.length < MAX_LISTED) violations.push({ constraint: c, code, message, refs }); };

  const offering = new Map(ds.offerings.map((o) => [o.offering_id, o]));
  const course = new Map(ds.courses.map((c) => [c.course_id, c]));
  const room = new Map(ds.rooms.map((r) => [r.room_id, r]));
  const teacher = new Map(ds.teachers.map((t) => [t.teacher_id, t]));
  const slot = new Map(ds.timeslots.map((t) => [`${t.day}|${t.period}`, t]));
  const days = [...new Set(ds.timeslots.map((t) => t.day))].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  // ---- C07: completeness
  const expected = new Map();
  let expectedPeriods = 0;
  for (const o of ds.offerings) {
    const c = course.get(o.course_id);
    for (let n = 1; n <= c.sessions_per_week; n++) expected.set(`${o.offering_id}|${n}`, c.session_length);
    expectedPeriods += c.sessions_per_week * c.session_length;
  }
  const seen = new Map();
  const rows = [];
  for (const a of assignments) {
    const key = `${a.offering_id}|${a.session_no}`;
    if (!expected.has(key)) { v('C07', 'unknown_session', `Row ${a.offering_id}#${a.session_no} does not exist in the offerings/courses data.`, { offering_id: a.offering_id }); continue; }
    if (seen.has(key)) { v('C07', 'duplicate_session', `Session ${a.offering_id}#${a.session_no} is scheduled more than once.`, { offering_id: a.offering_id }); continue; }
    seen.set(key, a); rows.push(a);
  }
  for (const key of expected.keys()) if (!seen.has(key)) v('C07', 'missing_session', `Session ${key.replace('|', '#')} is not scheduled.`, { offering_id: key.split('|')[0] });

  // ---- per-row checks (C04, C05, C06) and occupancy maps
  const tOcc = new Map(), rOcc = new Map(), gOcc = new Map(), sOcc = new Map();
  const push = (map, k, id) => { if (!map.has(k)) map.set(k, []); map.get(k).push(id); };
  const studentsByOff = new Map();
  for (const e of ds.enrollments) { if (!studentsByOff.has(e.offering_id)) studentsByOff.set(e.offering_id, []); studentsByOff.get(e.offering_id).push(e.student_id); }
  const tDay = new Map(), tWeek = new Map(), gDay = new Map(), offDays = new Map();
  let periods = 0;

  for (const a of rows) {
    const id = `${a.offering_id}#${a.session_no}`;
    const o = offering.get(a.offering_id), c = course.get(o.course_id), L = c.session_length;
    const start = Number(a.start_period), day = String(a.day).toUpperCase();
    const r = room.get(a.room_id);
    // C04
    if (!r) { v('C04', 'unknown_room', `${id}: room ${a.room_id} does not exist.`, { offering_id: a.offering_id, room_id: a.room_id }); }
    else {
      if (r.room_type !== c.required_room_type) v('C04', 'room_type_mismatch', `${id}: needs ${c.required_room_type} but ${r.room_id} is ${r.room_type}.`, { offering_id: a.offering_id, room_id: r.room_id });
      if (r.capacity < o.student_count) v('C04', 'room_too_small', `${id}: ${r.room_id} holds ${r.capacity} but the group has ${o.student_count}.`, { offering_id: a.offering_id, room_id: r.room_id });
    }
    // C05 / C06: every covered period must exist that day, in the same block (no lunch crossing)
    let slotsOk = days.includes(day) && Number.isInteger(start);
    const covered = [];
    if (!days.includes(day)) v('C05', 'bad_day', `${id}: day "${a.day}" is not a valid weekday.`, { offering_id: a.offering_id });
    else if (!Number.isInteger(start)) v('C05', 'bad_period', `${id}: start_period "${a.start_period}" is not an integer.`, { offering_id: a.offering_id });
    else {
      for (let k = 0; k < L; k++) {
        const t = slot.get(`${day}|${start + k}`);
        if (!t) { slotsOk = false; v('C06', 'not_consecutive', `${id}: period ${start + k} does not exist on ${day} (session needs ${L} consecutive periods).`, { offering_id: a.offering_id }); break; }
        covered.push(t);
      }
      if (slotsOk) for (let k = 1; k < covered.length; k++) {
        if (timeToMin(covered[k].start_time) !== timeToMin(covered[k - 1].end_time)) {
          slotsOk = false;
          v('C05', 'crosses_break', `${id}: ${day} P${start}-P${start + L - 1} crosses the lunch break.`, { offering_id: a.offering_id });
          break;
        }
      }
    }
    if (!slotsOk) continue;
    periods += L;
    // occupancy
    for (let k = 0; k < L; k++) {
      const p = start + k;
      push(tOcc, `${o.teacher_id}|${day}|${p}`, id);
      push(rOcc, `${a.room_id}|${day}|${p}`, id);
      push(gOcc, `${o.group_id}|${day}|${p}`, id);
      for (const s of studentsByOff.get(a.offering_id) || []) push(sOcc, `${s}|${day}|${p}`, a.offering_id);
    }
    tDay.set(`${o.teacher_id}|${day}`, (tDay.get(`${o.teacher_id}|${day}`) || 0) + L);
    tWeek.set(o.teacher_id, (tWeek.get(o.teacher_id) || 0) + L);
    gDay.set(`${o.group_id}|${day}`, (gDay.get(`${o.group_id}|${day}`) || 0) + L);
    if (!offDays.has(a.offering_id)) offDays.set(a.offering_id, new Map());
    const od = offDays.get(a.offering_id); if (!od.has(day)) od.set(day, []); od.get(day).push(a.session_no);
  }

  // ---- C01 / C02 / C03
  const clash = (map, c, label, mk) => { for (const [k, ids] of map) if (ids.length > 1) { const [who, d, p] = k.split('|'); v(c, label, `${mk} ${who} has ${ids.length} sessions at ${d} P${p}: ${ids.join(', ')}.`, { id: who, day: d, period: Number(p) }); } };
  clash(tOcc, 'C01', 'teacher_overlap', 'Teacher');
  clash(rOcc, 'C02', 'room_overlap', 'Room');
  clash(gOcc, 'C03', 'group_overlap', 'Group');
  // individual students (aggregate to offering pairs so a 30-student clash is one violation)
  const pairs = new Map();
  for (const [k, offs] of sOcc) if (offs.length > 1) {
    const [s, d, p] = k.split('|');
    const pk = [...new Set(offs)].sort().join(' vs ');
    if (!pairs.has(pk)) pairs.set(pk, { students: new Set(), d, p });
    pairs.get(pk).students.add(s);
  }
  for (const [pk, info] of pairs) v('C03', 'student_overlap', `Students overlap between ${pk} (e.g. ${info.d} P${info.p}); ${info.students.size} student(s) affected.`, { offerings: pk });

  // ---- C08
  for (const [oid, dm] of offDays) for (const [d, nums] of dm) if (nums.length > 1) v('C08', 'same_day', `${oid} has sessions ${nums.join(' & ')} both on ${d}.`, { offering_id: oid, day: d });

  // ---- C09
  for (const [k, n] of tDay) { const [t, d] = k.split('|'); const lim = teacher.get(t).max_periods_per_day; if (n > lim) v('C09', 'teacher_daily', `${t} teaches ${n} periods on ${d} (limit ${lim}).`, { teacher_id: t, day: d }); }
  for (const [t, n] of tWeek) { const lim = teacher.get(t).max_periods_per_week; if (n > lim) v('C09', 'teacher_weekly', `${t} teaches ${n} periods/week (limit ${lim}).`, { teacher_id: t }); }
  // ---- C10
  for (const [k, n] of gDay) { const [g, d] = k.split('|'); if (n > groupMax) v('C10', 'group_daily', `${g} has ${n} periods on ${d} (max ${groupMax}).`, { group_id: g, day: d }); }
  // ---- C11
  for (const b of ds.blocked_slots) {
    const map = b.resource_type === 'TEACHER' ? tOcc : rOcc;
    const ids = map.get(`${b.resource_id}|${b.day}|${b.period}`);
    if (ids) v('C11', b.resource_type === 'TEACHER' ? 'teacher_blocked' : 'room_closed', `${b.resource_type} ${b.resource_id} is blocked at ${b.day} P${b.period} (${b.reason || 'no reason'}) but used by ${ids.join(', ')}.`, { id: b.resource_id });
  }
  // ---- C12
  for (const f of ds.fixed_sessions) {
    const a = seen.get(`${f.offering_id}|${f.session_no}`);
    if (!a || String(a.day).toUpperCase() !== f.day || Number(a.start_period) !== f.start_period || a.room_id !== f.room_id)
      v('C12', 'fixed_moved', `Fixed session ${f.offering_id}#${f.session_no} must be ${f.day} P${f.start_period} in ${f.room_id}${a ? `, got ${a.day} P${a.start_period} ${a.room_id}` : ' (not scheduled)'}.`, { offering_id: f.offering_id });
  }

  const checks = Object.entries(CONSTRAINTS).map(([id, name]) => ({ id, name, passed: counts[id] === 0, violations: counts[id] }));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    valid: total === 0,
    totalViolations: total,
    checks,
    violations,
    truncated: total > violations.length,
    summary: { sessions: rows.length, expectedSessions: expected.size, periods, expectedPeriods },
  };
}
