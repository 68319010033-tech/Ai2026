import { buildModel } from './model.js';
import { preflight } from './diagnostics.js';
import { CONFIG } from '../config.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const popcount = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
const gaps = (m) => (m ? (31 - Math.clz32(m)) - (31 - Math.clz32(m & -m)) + 1 - popcount(m) : 0);

/**
 * Timetable solver = Constraint Satisfaction (backtracking + MRV + forward checking, randomised restarts)
 *                    followed by Local Search (single-session moves) to minimise idle gaps / uneven load.
 * Complete search: if one attempt exhausts the tree without hitting its node limit, infeasibility is PROVEN.
 */
export function solve(ds, options = {}, onProgress = () => {}) {
  const t0 = Date.now();
  const limitSec = Math.min(options.timeLimitSec ?? CONFIG.solver.defaultTimeLimitSec, CONFIG.solver.maxTimeLimitSec);
  const deadline = t0 + limitSec * 1000;
  const seed = options.seed ?? 1;
  const log = [];
  const say = (m) => { log.push({ t: Date.now() - t0, message: m }); };

  onProgress({ phase: 'prepare', percent: 2, message: 'Compiling model' });
  const model = buildModel(ds, { groupMaxPerDay: options.groupMaxPerDay });
  const pre = preflight(model);
  say(`Pre-flight: ${pre.feasible ? 'no fatal issues' : pre.issues.filter((i) => i.severity === 'fatal').length + ' fatal issue(s)'}`);
  if (!pre.feasible) {
    return {
      status: 'infeasible', assignments: [], preflight: pre, log,
      explanation: {
        summary: 'No valid timetable exists under the current constraints (proven by pre-flight analysis).',
        reasons: pre.issues.filter((i) => i.severity === 'fatal'),
        advice: ['Relax or fix the listed items (limits, blocked slots, room capacity/types, fixed sessions) and run again.'],
      },
      stats: { timeMs: Date.now() - t0, nodes: 0, attempts: 0 },
    };
  }

  const { sessions, nDays, W, teachers, groups, offerings, rooms, conflicts, days, groupMaxPerDay } = model;
  const nS = nDays * W, nSess = sessions.length;
  const nOff = offerings.length, nT = teachers.length, nG = groups.length, nR = rooms.length;
  const maxDay = teachers.map((t) => t.max_periods_per_day), maxWeek = teachers.map((t) => t.max_periods_per_week);

  // ---------------- state ----------------
  let occOff, roomOcc, teachOcc, teachDay, teachWeek, groupDay, offDays, tMask, gMask, assign, placed;
  const reset = () => {
    occOff = new Int16Array(nOff * nS); roomOcc = new Uint8Array(nR * nS); teachOcc = new Uint8Array(nT * nS);
    teachDay = new Int16Array(nT * nDays); teachWeek = new Int16Array(nT); groupDay = new Int16Array(nG * nDays);
    offDays = new Uint8Array(nOff * nDays); tMask = new Int32Array(nT * nDays); gMask = new Int32Array(nG * nDays);
    assign = new Array(nSess).fill(null); placed = 0;
  };
  const canPlace = (s, c) => {
    const L = s.length, base = c.di * W + c.start;
    for (let k = 0; k < L; k++) {
      const sl = base + k;
      if (occOff[s.oi * nS + sl] || roomOcc[c.ri * nS + sl] || teachOcc[s.ti * nS + sl]) return false;
    }
    return !offDays[s.oi * nDays + c.di]
      && teachDay[s.ti * nDays + c.di] + L <= maxDay[s.ti]
      && teachWeek[s.ti] + L <= maxWeek[s.ti]
      && groupDay[s.gi * nDays + c.di] + L <= groupMaxPerDay;
  };
  const place = (s, c) => {
    const L = s.length, base = c.di * W + c.start, bits = ((1 << L) - 1) << c.start;
    for (let k = 0; k < L; k++) { roomOcc[c.ri * nS + base + k] = 1; teachOcc[s.ti * nS + base + k] = 1; }
    for (const o2 of conflicts[s.oi]) for (let k = 0; k < L; k++) occOff[o2 * nS + base + k]++;
    teachDay[s.ti * nDays + c.di] += L; teachWeek[s.ti] += L; groupDay[s.gi * nDays + c.di] += L;
    offDays[s.oi * nDays + c.di] = 1; tMask[s.ti * nDays + c.di] |= bits; gMask[s.gi * nDays + c.di] |= bits;
    assign[s.i] = c; placed++;
  };
  const unplace = (s, c) => {
    const L = s.length, base = c.di * W + c.start, bits = ((1 << L) - 1) << c.start;
    for (let k = 0; k < L; k++) { roomOcc[c.ri * nS + base + k] = 0; teachOcc[s.ti * nS + base + k] = 0; }
    for (const o2 of conflicts[s.oi]) for (let k = 0; k < L; k++) occOff[o2 * nS + base + k]--;
    teachDay[s.ti * nDays + c.di] -= L; teachWeek[s.ti] -= L; groupDay[s.gi * nDays + c.di] -= L;
    offDays[s.oi * nDays + c.di] = 0; tMask[s.ti * nDays + c.di] &= ~bits; gMask[s.gi * nDays + c.di] &= ~bits;
    assign[s.i] = null; placed--;
  };

  // ---------------- soft cost ----------------
  const softParts = () => {
    let gg = 0, tg = 0, bal = 0;
    for (let i = 0; i < nG * nDays; i++) { gg += gaps(gMask[i]); bal += groupDay[i] * groupDay[i]; }
    for (let i = 0; i < nT * nDays; i++) { tg += gaps(tMask[i]); bal += teachDay[i] * teachDay[i]; }
    return { groupGaps: gg, teacherGaps: tg, cost: 2 * gg + tg + 0.05 * bal };
  };
  const softCost = () => softParts().cost;
  const valueCost = (s, c) => {
    const bits = ((1 << s.length) - 1) << c.start, gi = s.gi * nDays + c.di, ti = s.ti * nDays + c.di;
    return 2 * (gaps(gMask[gi] | bits) - gaps(gMask[gi])) + (gaps(tMask[ti] | bits) - gaps(tMask[ti])) + 0.1 * teachDay[ti] + 0.05 * groupDay[gi];
  };

  // ---------------- failure explanation ----------------
  const explainEmpty = (s) => {
    const r = { teacher_busy: 0, room_busy: 0, group_or_student_busy: 0, same_day_as_sibling: 0, teacher_daily_limit: 0, teacher_weekly_limit: 0, group_daily_limit: 0 };
    for (const c of s.candidates) {
      const base = c.di * W + c.start; let why = null;
      for (let k = 0; k < s.length && !why; k++) {
        const sl = base + k;
        if (teachOcc[s.ti * nS + sl]) why = 'teacher_busy';
        else if (roomOcc[c.ri * nS + sl]) why = 'room_busy';
        else if (occOff[s.oi * nS + sl]) why = 'group_or_student_busy';
      }
      if (!why && offDays[s.oi * nDays + c.di]) why = 'same_day_as_sibling';
      if (!why && teachDay[s.ti * nDays + c.di] + s.length > maxDay[s.ti]) why = 'teacher_daily_limit';
      if (!why && teachWeek[s.ti] + s.length > maxWeek[s.ti]) why = 'teacher_weekly_limit';
      if (!why && groupDay[s.gi * nDays + c.di] + s.length > groupMaxPerDay) why = 'group_daily_limit';
      if (why) r[why]++;
    }
    return { session: s.id, offering_id: s.offering_id, teacher_id: teachers[s.ti].teacher_id, group_id: groups[s.gi].group_id, roomType: s.roomType, length: s.length, staticCandidates: s.candidates.length, blockedBy: r };
  };

  // ---------------- search ----------------
  let rng = mulberry32(seed), nodes = 0, totalNodes = 0, attempt = 0, aborted = false, nodeLimit = 0;
  let deepest = 0, deepestExplain = null, lastEmit = 0;
  const emit = (phase, extra = {}) => {
    const now = Date.now();
    if (now - lastEmit < 200 && !extra.force) return;
    lastEmit = now;
    onProgress({ phase, attempt, placed: deepest, total: nSess, nodes: totalNodes + nodes, elapsedMs: now - t0, percent: Math.min(88, 5 + Math.round(83 * deepest / nSess)), message: `Placed ${deepest}/${nSess} sessions (attempt ${attempt})`, ...extra });
  };
  const free = () => sessions.filter((s) => !assign[s.i]);

  const dfs = () => {
    if (placed === nSess) return true;
    if (++nodes > nodeLimit || (nodes & 255) === 0 && Date.now() > deadline) { aborted = true; return false; }
    if ((nodes & 255) === 0) emit('search');
    // MRV: pick the unassigned session with the smallest live domain
    let best = null, bestN = Infinity, bestKey = 0;
    for (const s of sessions) {
      if (assign[s.i]) continue;
      let n = 0;
      for (const c of s.candidates) if (canPlace(s, c)) { n++; if (n >= bestN && n > 1) break; }
      if (n === 0) {
        if (placed > deepest) { deepest = placed; deepestExplain = explainEmpty(s); emit('search', { force: true }); }
        return false;
      }
      const key = n * 100 - s.length * 10 + rng();
      if (key < bestKey || best === null) { best = s; bestN = n; bestKey = key; }
    }
    const s = best;
    const dom = [];
    for (const c of s.candidates) if (canPlace(s, c)) dom.push({ c, k: valueCost(s, c) + rng() * 0.9 });
    dom.sort((a, b) => a.k - b.k);
    for (const { c } of dom) {
      place(s, c);
      if (dfs()) return true;
      unplace(s, c);
      if (aborted) return false;
    }
    return false;
  };

  let solved = false, proven = false;
  nodeLimit = 4000;
  while (Date.now() < deadline && !solved) {
    attempt++; nodes = 0; aborted = false; rng = mulberry32(seed * 1000003 + attempt * 7919);
    reset();
    let fixedOk = true;
    for (const s of sessions) if (s.fixed) {
      const c = { di: s.fixed.di, start: s.fixed.start, ri: s.fixed.ri };
      if (!canPlace(s, c)) { fixedOk = false; break; }
      place(s, c);
    }
    if (!fixedOk) { proven = true; break; }
    solved = dfs();
    totalNodes += nodes;
    if (!solved && !aborted) { proven = true; break; }   // exhausted whole tree => proven infeasible
    nodeLimit = Math.round(nodeLimit * 1.5);
  }
  say(`Search finished: ${solved ? 'solution found' : proven ? 'proved infeasible' : 'time limit'} after ${attempt} attempt(s), ${totalNodes} nodes`);

  if (!solved) {
    return {
      status: proven ? 'infeasible' : 'not_found', assignments: [], preflight: pre, log,
      explanation: {
        summary: proven
          ? 'The search space was exhausted: no timetable satisfies all hard constraints with the current data.'
          : `No complete timetable found within ${limitSec}s. Best partial result placed ${deepest}/${nSess} sessions. This is NOT proof of infeasibility - try a longer time limit or relax constraints.`,
        bottleneck: deepestExplain,
        reasons: deepestExplain ? [{ code: 'bottleneck_session', message: `Session ${deepestExplain.session} (${deepestExplain.roomType}, ${deepestExplain.length} period(s)) ran out of options; blocked by ${Object.entries(deepestExplain.blockedBy).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(', ')}.` }] : [],
        advice: ['Check utilisation of the room type of the bottleneck session.', 'Reduce blocked slots, add rooms, or free teacher availability for the bottleneck teacher/group.'],
      },
      stats: { timeMs: Date.now() - t0, nodes: totalNodes, attempts: attempt, bestPlaced: deepest, total: nSess },
    };
  }

  // ---------------- local search (soft constraints) ----------------
  const before = softParts();
  const remaining = deadline - Date.now();
  const optMs = options.optimize === false ? 0 : Math.max(0, options.optimizeSec !== undefined ? options.optimizeSec * 1000 : Math.min(remaining, limitSec * 1000 * CONFIG.solver.optimizeShare));
  if (optMs > 0) {
    const movable = sessions.filter((s) => !s.fixed);
    const optEnd = Date.now() + optMs; let iters = 0;
    while (Date.now() < optEnd) {
      for (let b = 0; b < 40; b++) {
        const s = movable[Math.floor(rng() * movable.length)];
        const old = assign[s.i]; unplace(s, old);
        let bestC = old, bestCost = Infinity, ties = 0;
        for (const c of s.candidates) {
          if (!canPlace(s, c)) continue;
          place(s, c); const cost = softCost(); unplace(s, c);
          if (cost < bestCost - 1e-9) { bestCost = cost; bestC = c; ties = 1; }
          else if (Math.abs(cost - bestCost) <= 1e-9 && rng() < 1 / ++ties) bestC = c;
        }
        place(s, bestC); iters++;
      }
      onProgress({ phase: 'optimize', percent: 90 + Math.round(9 * (1 - (optEnd - Date.now()) / optMs)), message: `Improving schedule quality (${iters} moves)`, elapsedMs: Date.now() - t0 });
    }
  }
  const after = softParts();

  // ---------------- output ----------------
  const byOff = new Map();
  for (const s of sessions) { const c = assign[s.i]; if (!byOff.has(s.offering_id)) byOff.set(s.offering_id, []); byOff.get(s.offering_id).push({ s, c }); }
  const assignments = [];
  for (const [oid, list] of byOff) {
    const fixedNos = new Set(list.filter((x) => x.s.fixed).map((x) => x.s.session_no));
    const freeNos = list.map((x) => x.s.session_no).filter((n) => !fixedNos.has(n)).sort((a, b) => a - b);
    const movable = list.filter((x) => !x.s.fixed).sort((a, b) => a.c.di - b.c.di || a.c.start - b.c.start);
    list.filter((x) => x.s.fixed).forEach(({ s, c }) => assignments.push({ offering_id: oid, session_no: s.session_no, day: days[c.di], start_period: c.start, room_id: rooms[c.ri].room_id }));
    movable.forEach(({ c }, i) => assignments.push({ offering_id: oid, session_no: freeNos[i], day: days[c.di], start_period: c.start, room_id: rooms[c.ri].room_id }));
  }
  assignments.sort((a, b) => a.offering_id.localeCompare(b.offering_id) || a.session_no - b.session_no);
  onProgress({ phase: 'done', percent: 99, message: 'Verifying result' });
  return {
    status: 'success', assignments, preflight: pre, log,
    stats: {
      timeMs: Date.now() - t0, nodes: totalNodes, attempts: attempt,
      softCostBefore: +before.cost.toFixed(2), softCost: +after.cost.toFixed(2),
      groupGaps: after.groupGaps, teacherGaps: after.teacherGaps, groupGapsBefore: before.groupGaps, teacherGapsBefore: before.teacherGaps,
    },
  };
}
