import { DAY_ORDER, CONFIG } from '../config.js';
import { timeToMin } from '../utils/text.js';

/**
 * Compiles a cleaned dataset into index-based structures used by the solver & diagnostics.
 * Slot index = dayIdx * (maxPeriod+1) + period
 */
export function buildModel(ds, opts = {}) {
  const groupMaxPerDay = opts.groupMaxPerDay ?? CONFIG.groupMaxPeriodsPerDay;
  const days = [...new Set(ds.timeslots.map((t) => t.day))].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const maxP = Math.max(...ds.timeslots.map((t) => t.period));
  const W = maxP + 1;
  const nDays = days.length;
  const slotOf = (d, p) => d * W + p;

  const slotTime = new Map(ds.timeslots.map((t) => [`${t.day}|${t.period}`, t]));
  const validSlot = new Uint8Array(nDays * W);
  days.forEach((day, di) => ds.timeslots.filter((t) => t.day === day).forEach((t) => { validSlot[slotOf(di, t.period)] = 1; }));

  // Blocks of consecutive periods (split by a time gap such as lunch). A session may not cross a block boundary.
  const blocksByDay = days.map((day) => {
    const ts = ds.timeslots.filter((t) => t.day === day).sort((a, b) => a.period - b.period);
    const blocks = []; let cur = [];
    ts.forEach((t, i) => {
      const prev = ts[i - 1];
      const contiguous = prev && t.period === prev.period + 1 && timeToMin(t.start_time) === timeToMin(prev.end_time);
      if (cur.length && !contiguous) { blocks.push(cur); cur = []; }
      cur.push(t.period);
    });
    if (cur.length) blocks.push(cur);
    return blocks;
  });
  const startsFor = (di, len) => {
    const out = [];
    for (const b of blocksByDay[di]) for (let i = 0; i + len <= b.length; i++) out.push(b[i]);
    return out;
  };

  const teachers = ds.teachers, rooms = ds.rooms, groups = ds.groups, offerings = ds.offerings;
  const tIdx = new Map(teachers.map((t, i) => [t.teacher_id, i]));
  const rIdx = new Map(rooms.map((r, i) => [r.room_id, i]));
  const gIdx = new Map(groups.map((g, i) => [g.group_id, i]));
  const oIdx = new Map(offerings.map((o, i) => [o.offering_id, i]));
  const courseById = new Map(ds.courses.map((c) => [c.course_id, c]));
  const dIdx = new Map(days.map((d, i) => [d, i]));

  const tBlocked = new Uint8Array(teachers.length * nDays * W);
  const rBlocked = new Uint8Array(rooms.length * nDays * W);
  for (const b of ds.blocked_slots) {
    const di = dIdx.get(b.day); if (di === undefined) continue;
    if (b.resource_type === 'TEACHER') tBlocked[(tIdx.get(b.resource_id) * nDays * W) + slotOf(di, b.period)] = 1;
    else rBlocked[(rIdx.get(b.resource_id) * nDays * W) + slotOf(di, b.period)] = 1;
  }

  // offering conflict sets: offerings sharing a group or at least one student can never overlap
  const offeringsOfGroup = new Map();
  offerings.forEach((o, i) => { const g = o.group_id; if (!offeringsOfGroup.has(g)) offeringsOfGroup.set(g, []); offeringsOfGroup.get(g).push(i); });
  const studentsOfOffering = new Map(), offeringsOfStudent = new Map();
  for (const e of ds.enrollments) {
    const oi = oIdx.get(e.offering_id); if (oi === undefined) continue;
    if (!studentsOfOffering.has(oi)) studentsOfOffering.set(oi, []);
    studentsOfOffering.get(oi).push(e.student_id);
    if (!offeringsOfStudent.has(e.student_id)) offeringsOfStudent.set(e.student_id, new Set());
    offeringsOfStudent.get(e.student_id).add(oi);
  }
  const conflicts = offerings.map((o, i) => {
    const set = new Set(offeringsOfGroup.get(o.group_id) || []);
    for (const s of studentsOfOffering.get(i) || []) for (const j of offeringsOfStudent.get(s)) set.add(j);
    set.add(i);                      // own sessions can not overlap either
    return [...set];
  });

  // sessions
  const sessions = [];
  offerings.forEach((o, oi) => {
    const c = courseById.get(o.course_id);
    for (let n = 1; n <= c.sessions_per_week; n++) {
      sessions.push({
        i: sessions.length, id: `${o.offering_id}#${n}`, offering_id: o.offering_id, oi, session_no: n,
        course_id: c.course_id, length: c.session_length, roomType: c.required_room_type,
        ti: tIdx.get(o.teacher_id), gi: gIdx.get(o.group_id), count: o.student_count, fixed: null,
      });
    }
  });
  const sessionByKey = new Map(sessions.map((s) => [`${s.offering_id}|${s.session_no}`, s]));
  for (const f of ds.fixed_sessions) {
    const s = sessionByKey.get(`${f.offering_id}|${f.session_no}`);
    if (s) s.fixed = { di: dIdx.get(f.day), start: f.start_period, ri: rIdx.get(f.room_id) };
  }

  // static candidates (everything that does not depend on other sessions)
  for (const s of sessions) {
    const roomIdxs = rooms.map((r, i) => i).filter((i) => rooms[i].room_type === s.roomType && rooms[i].capacity >= s.count);
    s.roomCandidates = roomIdxs;
    const cands = [];
    for (let di = 0; di < nDays; di++) {
      for (const st of startsFor(di, s.length)) {
        let tOk = true;
        for (let k = 0; k < s.length; k++) if (tBlocked[s.ti * nDays * W + slotOf(di, st + k)]) tOk = false;
        if (!tOk) continue;
        for (const ri of roomIdxs) {
          let rOk = true;
          for (let k = 0; k < s.length; k++) if (rBlocked[ri * nDays * W + slotOf(di, st + k)]) rOk = false;
          if (rOk) cands.push({ di, start: st, ri });
        }
      }
    }
    s.candidates = cands;
  }

  return {
    ds, days, nDays, maxP, W, slotOf, slotTime, validSlot, blocksByDay, startsFor,
    teachers, rooms, groups, offerings, sessions, sessionByKey, conflicts, groupMaxPerDay,
    tBlocked, rBlocked, tIdx, rIdx, gIdx, oIdx, dIdx, courseById,
  };
}
