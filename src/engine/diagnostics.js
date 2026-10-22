/** Pre-flight feasibility analysis: catches provably-infeasible inputs before spending CPU, and explains why. */
export function preflight(model) {
  const { ds, sessions, teachers, rooms, groups, nDays, W, slotOf, days, groupMaxPerDay } = model;
  const issues = [];
  const add = (severity, code, message, refs = {}) => issues.push({ severity, code, message, refs });

  // sessions that have no static candidate at all
  for (const s of sessions) {
    if (s.fixed) continue;
    if (!s.roomCandidates.length) add('fatal', 'no_suitable_room', `${s.offering_id}: no ${s.roomType} room can hold ${s.count} students.`, { offering_id: s.offering_id });
    else if (!s.candidates.length) add('fatal', 'no_candidate_slot', `${s.id}: every slot is blocked for the teacher or the available rooms.`, { offering_id: s.offering_id });
  }
  const seen = new Set();
  issues.splice(0, issues.length, ...issues.filter((i) => { const k = i.code + i.refs.offering_id; if (seen.has(k)) return false; seen.add(k); return true; }));

  // teacher weekly load vs limit vs availability
  const load = new Map();
  for (const s of sessions) load.set(s.ti, (load.get(s.ti) || 0) + s.length);
  const slotsPerDay = (di) => ds.timeslots.filter((t) => t.day === days[di]).length;
  for (const [ti, l] of load) {
    const t = teachers[ti];
    if (l > t.max_periods_per_week) add('fatal', 'teacher_weekly_overload', `${t.teacher_id} must teach ${l} periods/week but the limit is ${t.max_periods_per_week}.`, { teacher_id: t.teacher_id });
    let avail = 0;
    for (let di = 0; di < nDays; di++) {
      let free = 0;
      for (let p = 1; p < W; p++) if (model.validSlot[slotOf(di, p)] && !model.tBlocked[ti * nDays * W + slotOf(di, p)]) free++;
      avail += Math.min(free, t.max_periods_per_day);
    }
    if (l > avail) add('fatal', 'teacher_no_time', `${t.teacher_id} needs ${l} periods but only ${avail} are available after blocked slots and daily limits.`, { teacher_id: t.teacher_id });
  }
  for (const s of sessions) {
    const t = teachers[s.ti];
    if (s.length > t.max_periods_per_day) add('fatal', 'session_exceeds_daily_limit', `${s.id}: session length ${s.length} exceeds ${t.teacher_id}'s daily limit ${t.max_periods_per_day}.`, { offering_id: s.offering_id });
  }

  // group load
  const gl = new Map();
  for (const s of sessions) gl.set(s.gi, (gl.get(s.gi) || 0) + s.length);
  for (const [gi, l] of gl) {
    const cap = Math.min(nDays * groupMaxPerDay, ds.timeslots.length);
    if (l > cap) add('fatal', 'group_overload', `${groups[gi].group_id} has ${l} periods/week but at most ${cap} fit (max ${groupMaxPerDay}/day).`, { group_id: groups[gi].group_id });
  }

  // room-type capacity (period-count and block-packing bound)
  const byType = new Map();
  for (const s of sessions) {
    if (!byType.has(s.roomType)) byType.set(s.roomType, []);
    byType.get(s.roomType).push(s);
  }
  const capacityTable = [];
  for (const [type, ss] of byType) {
    const rs = rooms.map((r, i) => ({ r, i })).filter((x) => x.r.room_type === type);
    let supply = 0, blockSlots = 0;
    for (const { i } of rs) for (let di = 0; di < nDays; di++) for (let p = 1; p < W; p++)
      if (model.validSlot[slotOf(di, p)] && !model.rBlocked[i * nDays * W + slotOf(di, p)]) supply++;
    const demand = ss.reduce((a, s) => a + s.length, 0);
    capacityTable.push({ room_type: type, rooms: rs.length, demandPeriods: demand, supplyPeriods: supply, utilization: supply ? +(demand / supply).toFixed(3) : null });
    if (demand > supply) add('fatal', 'room_type_overload', `Room type ${type}: ${demand} periods needed but only ${supply} available after closures.`, { room_type: type });
    else if (supply && demand / supply > 0.85) add('warning', 'room_type_tight', `Room type ${type} is ${(100 * demand / supply).toFixed(0)}% utilised - solver may need more time.`, { room_type: type });
  }

  // fixed sessions: must be individually legal
  for (const f of ds.fixed_sessions) {
    const s = model.sessionByKey.get(`${f.offering_id}|${f.session_no}`);
    if (!s) continue;
    const di = model.dIdx.get(f.day), ri = model.rIdx.get(f.room_id);
    const ok = s.candidates.some((c) => c.di === di && c.start === f.start_period && c.ri === ri);
    if (!ok) add('fatal', 'fixed_session_illegal', `Fixed session ${f.offering_id}#${f.session_no} (${f.day} P${f.start_period} ${f.room_id}) violates room type/capacity, lunch break, or a blocked slot.`, { offering_id: f.offering_id });
  }
  const fixedKeys = ds.fixed_sessions.map((f) => ({ f, s: model.sessionByKey.get(`${f.offering_id}|${f.session_no}`) })).filter((x) => x.s);
  for (let a = 0; a < fixedKeys.length; a++) for (let b = a + 1; b < fixedKeys.length; b++) {
    const A = fixedKeys[a], B = fixedKeys[b];
    if (A.f.day !== B.f.day) continue;
    const overlap = A.f.start_period < B.f.start_period + B.s.length && B.f.start_period < A.f.start_period + A.s.length;
    if (!overlap) continue;
    const clash = A.f.room_id === B.f.room_id || A.s.ti === B.s.ti || model.conflicts[A.s.oi].includes(B.s.oi);
    if (clash) add('fatal', 'fixed_sessions_conflict', `Fixed sessions ${A.f.offering_id} and ${B.f.offering_id} overlap in time and share a room, teacher or students.`, {});
  }
  return { feasible: !issues.some((i) => i.severity === 'fatal'), issues, capacity: capacityTable };
}
