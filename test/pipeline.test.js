import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawTablesFromDir } from '../src/data/loader.js';
import { cleanDataset } from '../src/data/cleaner.js';
import { solve } from '../src/engine/solver.js';
import { validate } from '../src/engine/validator.js';

const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../sample-data/raw');
const load = () => cleanDataset(rawTablesFromDir(RAW));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('cleaner repairs the known dirty cells', () => {
  const { dataset, report } = load();
  assert.equal(report.ok, true);
  assert.equal(dataset.teachers.length, 16);                    // duplicate T07 removed
  assert.equal(dataset.offerings.length, 56);                   // duplicate row removed
  assert.ok(dataset.teachers.every((t) => /^T\d\d$/.test(t.teacher_id)));      // t02 / Ｔ０９ fixed
  assert.ok(dataset.teachers.every((t) => Number.isInteger(t.max_periods_per_week) && t.max_periods_per_day === 6)); // "20 คาบ", ๖
  assert.ok(dataset.offerings.every((o) => dataset.courses.some((c) => c.course_id === o.course_id)));        // C-103
  assert.equal(dataset.offerings.find((o) => o.offering_id === 'O045').student_count, 25);                    // 250 -> 25
  assert.ok(dataset.offerings.every((o) => Number.isInteger(o.student_count)));                               // O020 filled
  assert.equal(report.summary.expectedSessions, 88);
  assert.equal(report.summary.expectedPeriods, 160);
});

test('solver output satisfies all 12 hard constraints', () => {
  const { dataset } = load();
  for (const seed of [1, 2, 3]) {
    const r = solve(dataset, { timeLimitSec: 20, optimize: false, seed });
    assert.equal(r.status, 'success');
    const v = validate(dataset, r.assignments);
    assert.equal(v.valid, true, JSON.stringify(v.violations.slice(0, 3)));
    assert.equal(v.summary.sessions, 88);
    assert.equal(v.summary.periods, 160);
  }
});

test('validator catches tampering', () => {
  const { dataset } = load();
  const r = solve(dataset, { timeLimitSec: 20, optimize: false });
  const a = clone(r.assignments);
  a[0] = { ...a[0], day: a[1].day, start_period: a[1].start_period, room_id: a[1].room_id };
  a.pop();
  const v = validate(dataset, a);
  assert.equal(v.valid, false);
  const failed = v.checks.filter((c) => !c.passed).map((c) => c.id);
  assert.ok(failed.includes('C02') && failed.includes('C07'));
});

test('lunch-break crossing and fixed-session moves are rejected', () => {
  const { dataset } = load();
  const r = solve(dataset, { timeLimitSec: 20, optimize: false });
  const a = clone(r.assignments);
  const three = a.find((x) => dataset.courses.find((c) => c.course_id === dataset.offerings.find((o) => o.offering_id === x.offering_id).course_id).session_length === 3 && !dataset.fixed_sessions.some((f) => f.offering_id === x.offering_id));
  three.start_period = 3;                                            // P3-P5 crosses lunch
  assert.ok(validate(dataset, a).checks.find((c) => c.id === 'C05').violations > 0);
  const b = clone(r.assignments);
  b.find((x) => x.offering_id === 'O007' && x.session_no === 1).day = 'MON';
  assert.ok(validate(dataset, b).checks.find((c) => c.id === 'C12').violations > 0);
});

test('infeasible input is reported with a reason, never a bogus timetable', () => {
  const { dataset } = load();
  const d = clone(dataset);
  d.teachers.find((t) => t.teacher_id === 'T01').max_periods_per_week = 10;
  const r = solve(d, { timeLimitSec: 5 });
  assert.equal(r.status, 'infeasible');
  assert.equal(r.assignments.length, 0);
  assert.match(r.explanation.reasons[0].message, /T01/);
});
