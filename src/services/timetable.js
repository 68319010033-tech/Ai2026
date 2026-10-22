import { DAY_ORDER } from '../config.js';

const FIELD = { group: 'group_id', teacher: 'teacher_id', room: 'room_id' };
export const VIEWS = Object.keys(FIELD);

export function buildEntries(ds, assignments) {
  const off = new Map(ds.offerings.map((o) => [o.offering_id, o]));
  const course = new Map(ds.courses.map((c) => [c.course_id, c]));
  const teacher = new Map(ds.teachers.map((t) => [t.teacher_id, t]));
  const room = new Map(ds.rooms.map((r) => [r.room_id, r]));
  const slot = new Map(ds.timeslots.map((t) => [`${t.day}|${t.period}`, t]));
  return assignments.map((a) => {
    const o = off.get(a.offering_id), c = course.get(o.course_id), L = c.session_length;
    const end = a.start_period + L - 1;
    return {
      offering_id: a.offering_id, session_no: a.session_no, course_id: c.course_id, course_name: c.course_name,
      group_id: o.group_id, teacher_id: o.teacher_id, teacher_name: teacher.get(o.teacher_id).teacher_name,
      room_id: a.room_id, room_name: room.get(a.room_id).room_name, room_type: room.get(a.room_id).room_type,
      day: a.day, start_period: a.start_period, end_period: end, length: L,
      start_time: slot.get(`${a.day}|${a.start_period}`).start_time, end_time: slot.get(`${a.day}|${end}`).end_time,
    };
  }).sort((x, y) => DAY_ORDER.indexOf(x.day) - DAY_ORDER.indexOf(y.day) || x.start_period - y.start_period);
}

export function filterEntries(entries, q = {}) {
  const needle = (q.q || '').toString().trim().toLowerCase();
  const eq = (v, want) => !want || String(v).toUpperCase() === String(want).toUpperCase();
  return entries.filter((e) =>
    eq(e.group_id, q.group) && eq(e.teacher_id, q.teacher) && eq(e.room_id, q.room) && eq(e.day, q.day) && eq(e.course_id, q.course)
    && (!needle || [e.offering_id, e.course_id, e.course_name, e.group_id, e.teacher_id, e.teacher_name, e.room_id, e.room_name].some((x) => String(x).toLowerCase().includes(needle))));
}

export function listKeys(ds, entries, view) {
  const field = FIELD[view];
  const source = view === 'group' ? ds.groups.map((g) => ({ key: g.group_id, label: `${g.group_id}${g.program ? ' (' + g.program + ')' : ''}` }))
    : view === 'teacher' ? ds.teachers.map((t) => ({ key: t.teacher_id, label: `${t.teacher_id} ${t.teacher_name}` }))
      : ds.rooms.map((r) => ({ key: r.room_id, label: `${r.room_id} ${r.room_name}` }));
  return source.map((s) => {
    const es = entries.filter((e) => e[field] === s.key);
    return { ...s, sessions: es.length, periods: es.reduce((a, e) => a + e.length, 0) };
  });
}

/** Grid for one group/teacher/room: rows = periods, cells = one per day. */
export function gridFor(ds, entries, view, key) {
  const field = FIELD[view];
  const es = entries.filter((e) => e[field] === key);
  const days = [...new Set(ds.timeslots.map((t) => t.day))];
  const periods = [...new Map(ds.timeslots.map((t) => [t.period, t])).values()].sort((a, b) => a.period - b.period);
  const rows = periods.map((p) => ({
    period: p.period, start_time: p.start_time, end_time: p.end_time,
    cells: days.map((d) => {
      const e = es.find((x) => x.day === d && p.period >= x.start_period && p.period <= x.end_period);
      return e ? { entry: e, startsHere: e.start_period === p.period, offset: p.period - e.start_period } : null;
    }),
  }));
  return { view, key, days, periods: periods.map((p) => ({ period: p.period, start_time: p.start_time, end_time: p.end_time })), rows, entries: es };
}

const gapsOf = (periods) => { if (!periods.length) return 0; const s = [...new Set(periods)].sort((a, b) => a - b); return s[s.length - 1] - s[0] + 1 - s.length; };

export function computeStats(ds, entries, solverStats = {}) {
  const days = [...new Set(ds.timeslots.map((t) => t.day))];
  const per = (items, field, idKey) => items.map((it) => {
    const es = entries.filter((e) => e[field] === it[idKey]);
    const perDay = Object.fromEntries(days.map((d) => [d, es.filter((e) => e.day === d).reduce((a, e) => a + e.length, 0)]));
    const gaps = days.reduce((a, d) => a + gapsOf(es.filter((e) => e.day === d).flatMap((e) => Array.from({ length: e.length }, (_, k) => e.start_period + k))), 0);
    return { id: it[idKey], sessions: es.length, periods: es.reduce((a, e) => a + e.length, 0), daysUsed: days.filter((d) => perDay[d] > 0).length, perDay, gaps };
  });
  const rooms = per(ds.rooms, 'room_id', 'room_id').map((r) => {
    const room = ds.rooms.find((x) => x.room_id === r.id);
    const blocked = ds.blocked_slots.filter((b) => b.resource_type === 'ROOM' && b.resource_id === r.id).length;
    const avail = ds.timeslots.length - blocked;
    return { ...r, room_type: room.room_type, availablePeriods: avail, utilization: +(r.periods / avail).toFixed(3) };
  });
  return {
    totals: { sessions: entries.length, periods: entries.reduce((a, e) => a + e.length, 0) },
    groups: per(ds.groups, 'group_id', 'group_id'), teachers: per(ds.teachers, 'teacher_id', 'teacher_id'), rooms,
    quality: { groupGaps: solverStats.groupGaps, teacherGaps: solverStats.teacherGaps, softCost: solverStats.softCost, softCostBefore: solverStats.softCostBefore },
  };
}
