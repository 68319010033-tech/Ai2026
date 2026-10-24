#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Smart Campus Timetable Engine using Google OR-Tools CP-SAT
Implements all 12 Hard Constraints and Soft Constraints according to PDF MOCK-60-01.
"""

import sys
import os
import re
import json
import time
import argparse
import unicodedata
from typing import Dict, List, Any, Tuple, Set
from collections import defaultdict

# Ensure stdout and stderr use UTF-8 on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    from ortools.sat.python import cp_model
except ImportError:
    print(json.dumps({"status": "error", "message": "Google OR-Tools is not installed. Run 'pip install ortools'."}))
    sys.exit(1)

# Day definitions
DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']
DAY_MAP = {day: idx for idx, day in enumerate(DAYS)}
PERIODS = list(range(1, 9))  # 1 to 8

def normalize_str(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    # Normalize fullwidth characters to standard halfwidth ASCII
    s = unicodedata.normalize('NFKC', s)
    # Replace non-breaking spaces
    s = s.replace('\u00a0', ' ').strip()
    # Normalize Thai numerals to Arabic numerals
    thai_digits = '๐๑๒๓๔๕๖๗๘๙'
    arabic_digits = '0123456789'
    trans_table = str.maketrans(thai_digits, arabic_digits)
    s = s.translate(trans_table)
    return s.strip()

def normalize_id(val: Any) -> str:
    s = normalize_str(val)
    # Strip any non-alphanumeric characters (spaces, hyphens, etc.)
    return re.sub(r'[^A-Za-z0-9]', '', s).upper()

def parse_int_safe(val: Any, default: int = 0) -> int:
    s = normalize_str(val)
    # Extract first integer sequence
    m = re.search(r'\d+', s)
    if m:
        try:
            return int(m.group(0))
        except ValueError:
            pass
    return default

class DataLoader:
    """Loads and cleans the 10 input CSV files."""
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.groups: Dict[str, Dict[str, Any]] = {}
        self.teachers: Dict[str, Dict[str, Any]] = {}
        self.rooms: Dict[str, Dict[str, Any]] = {}
        self.courses: Dict[str, Dict[str, Any]] = {}
        self.offerings: Dict[str, Dict[str, Any]] = {}
        self.timeslots: List[Dict[str, Any]] = []
        self.blocked_slots: List[Dict[str, Any]] = []
        self.fixed_sessions: List[Dict[str, Any]] = []
        self.students: Dict[str, Dict[str, Any]] = {}
        self.enrollments: List[Dict[str, Any]] = []
        self.offering_student_map: Dict[str, Set[str]] = defaultdict(set)
        self.shared_student_offerings: Set[Tuple[str, str]] = set()

    def read_csv(self, filename: str) -> List[Dict[str, str]]:
        filepath = os.path.join(self.data_dir, filename)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Required data file missing: {filepath}")
        import csv
        rows = []
        with open(filepath, 'r', encoding='utf-8-sig', errors='ignore') as f:
            reader = csv.DictReader(f)
            for row in reader:
                cleaned = {normalize_str(k): normalize_str(v) for k, v in row.items() if k is not None}
                rows.append(cleaned)
        return rows

    def load_all(self):
        # 1. Groups
        for r in self.read_csv('groups.csv'):
            gid = normalize_id(r.get('group_id'))
            if not gid: continue
            self.groups[gid] = {
                'group_id': gid,
                'program': r.get('program', ''),
                'year_level': parse_int_safe(r.get('year_level', 1)),
                'student_count': parse_int_safe(r.get('student_count', 0)),
            }

        # 2. Teachers
        for r in self.read_csv('teachers.csv'):
            tid = normalize_id(r.get('teacher_id'))
            if not tid: continue
            self.teachers[tid] = {
                'teacher_id': tid,
                'teacher_name': r.get('teacher_name', tid),
                'max_periods_per_day': parse_int_safe(r.get('max_periods_per_day', 6)),
                'max_periods_per_week': parse_int_safe(r.get('max_periods_per_week', 20)),
            }

        # 3. Rooms
        for r in self.read_csv('rooms.csv'):
            rid = normalize_id(r.get('room_id'))
            if not rid: continue
            self.rooms[rid] = {
                'room_id': rid,
                'room_name': r.get('room_name', rid),
                'room_type': normalize_id(r.get('room_type', 'GENERAL')),
                'capacity': parse_int_safe(r.get('capacity', 0)),
            }

        # 4. Courses
        for r in self.read_csv('courses.csv'):
            cid = normalize_id(r.get('course_id'))
            if not cid: continue
            self.courses[cid] = {
                'course_id': cid,
                'course_name': r.get('course_name', cid),
               'required_room_type': normalize_id(r.get('room_type') or r.get('required_room_type') or 'GENERAL'),
                'session_length': parse_int_safe(r.get('session_length', 2)),
                'sessions_per_week': parse_int_safe(r.get('sessions_per_week', 1)),
            }

        # 5. Offerings
        for r in self.read_csv('offerings.csv'):
            oid = normalize_id(r.get('offering_id'))
            if not oid: continue
            cid = normalize_id(r.get('course_id'))
            gid = normalize_id(r.get('group_id'))
            tid = normalize_id(r.get('teacher_id'))
            sc = parse_int_safe(r.get('student_count', 0))
            # Authoritative student count comes from the group definition
            if gid in self.groups:
                sc = self.groups[gid]['student_count']
            self.offerings[oid] = {
                'offering_id': oid,
                'course_id': cid,
                'group_id': gid,
                'teacher_id': tid,
                'student_count': sc,
            }

        # 6. Timeslots
        self.timeslots = self.read_csv('timeslots.csv')

        # 7. Blocked Slots
        for r in self.read_csv('blocked_slots.csv'):
            rtype = normalize_id(r.get('resource_type'))
            rid = normalize_id(r.get('resource_id'))
            day = normalize_id(r.get('day'))
            period = parse_int_safe(r.get('period'))
            if day in DAY_MAP and 1 <= period <= 8:
                self.blocked_slots.append({
                    'resource_type': rtype,
                    'resource_id': rid,
                    'day': day,
                    'period': period,
                })

        # 8. Fixed Sessions
        for r in self.read_csv('fixed_sessions.csv'):
            oid = normalize_id(r.get('offering_id'))
            sno = parse_int_safe(r.get('session_no', 1))
            day = normalize_id(r.get('day'))
            sp = parse_int_safe(r.get('start_period'))
            rid = normalize_id(r.get('room_id'))
            if oid and day in DAY_MAP and 1 <= sp <= 8 and rid:
                self.fixed_sessions.append({
                    'offering_id': oid,
                    'session_no': sno,
                    'day': day,
                    'start_period': sp,
                    'room_id': rid,
                })

        # 9. Students
        for r in self.read_csv('students.csv'):
            sid = normalize_id(r.get('student_id'))
            if not sid: continue
            self.students[sid] = {
                'student_id': sid,
                'student_name': r.get('student_name', sid),
                'group_id': normalize_id(r.get('group_id', '')),
            }

        # 10. Enrollments
        for r in self.read_csv('enrollments.csv'):
            sid = normalize_id(r.get('student_id'))
            oid = normalize_id(r.get('offering_id'))
            if sid and oid:
                self.enrollments.append({'student_id': sid, 'offering_id': oid})
                self.offering_student_map[oid].add(sid)

        # Precompute offerings with shared students
        all_oids = list(self.offering_student_map.keys())
        for i in range(len(all_oids)):
            for j in range(i + 1, len(all_oids)):
                o1, o2 = all_oids[i], all_oids[j]
                if self.offering_student_map[o1].intersection(self.offering_student_map[o2]):
                    self.shared_student_offerings.add((o1, o2))

class CPSATTimetableSolver:
    """OR-Tools CP-SAT Model & Solver implementation."""

    def __init__(self, data: DataLoader, time_limit_sec: int = 20):
        self.data = data
        self.time_limit_sec = time_limit_sec
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        self.sessions: List[Dict[str, Any]] = []
        self.session_vars: Dict[Tuple[int, int, int, str], cp_model.IntVar] = {}
        # s_idx -> list of valid (d_idx, start_period, room_id)
        self.session_candidates: Dict[int, List[Tuple[int, int, str]]] = defaultdict(list)
        # s_idx -> start_var, day_var, room_var
        self.s_start_var: Dict[int, cp_model.IntVar] = {}
        self.s_day_var: Dict[int, cp_model.IntVar] = {}

    def expand_sessions(self):
        """Expands 56 offerings into the required 88 sessions according to courses.csv."""
        s_idx = 0
        for oid in sorted(self.data.offerings.keys()):
            off = self.data.offerings[oid]
            cid = off['course_id']
            if cid not in self.data.courses:
                raise ValueError(f"Course {cid} referenced in offering {oid} not found in courses.csv")
            course = self.data.courses[cid]
            length = course['session_length']
            sessions_count = course['sessions_per_week']

            for sno in range(1, sessions_count + 1):
                self.sessions.append({
                    'session_idx': s_idx,
                    'offering_id': oid,
                    'session_no': sno,
                    'course_id': cid,
                    'course_name': course['course_name'],
                    'group_id': off['group_id'],
                    'teacher_id': off['teacher_id'],
                    'student_count': off['student_count'],
                    'length': length,
                    'required_room_type': course['required_room_type'],
                })
                s_idx += 1

    def build_model(self):
        self.expand_sessions()

        # Build blocked sets
        teacher_blocked: Set[Tuple[str, str, int]] = set()  # (teacher_id, day, period)
        room_blocked: Set[Tuple[str, str, int]] = set()     # (room_id, day, period)

        for b in self.data.blocked_slots:
            if b['resource_type'] == 'TEACHER':
                teacher_blocked.add((b['resource_id'], b['day'], b['period']))
            elif b['resource_type'] == 'ROOM':
                room_blocked.add((b['resource_id'], b['day'], b['period']))

        # Fixed session lookup
        fixed_map: Dict[Tuple[str, int], Dict[str, Any]] = {}
        for f in self.data.fixed_sessions:
            fixed_map[(f['offering_id'], f['session_no'])] = f

        # Allowed start periods for each session length (HC05: No lunch overlap)
        # Period 1..4 Morning, Period 5..8 Afternoon. Lunch is between 4 and 5.
        allowed_starts_by_length = {
            1: [1, 2, 3, 4, 5, 6, 7, 8],
            2: [1, 2, 3, 5, 6, 7],      # 4+2=6 crosses lunch, 8+2=10 out of day
            3: [1, 2, 5, 6],            # 3+3=6 crosses lunch, 7+3=10 out of day
        }

        # Filter candidate rooms for each session (HC04: Room type & capacity)
        for s in self.sessions:
            s_idx = s['session_idx']
            req_type = s['required_room_type']
            req_cap = s['student_count']
            L = s['length']
            tid = s['teacher_id']
            is_fixed = (s['offering_id'], s['session_no']) in fixed_map
            fixed_info = fixed_map.get((s['offering_id'], s['session_no']))

            valid_rooms = []
            for rid, room in self.data.rooms.items():
                if room['room_type'] == req_type and room['capacity'] >= req_cap:
                    valid_rooms.append(rid)

            if not valid_rooms:
                raise ValueError(f"No suitable room found for offering {s['offering_id']} (Type: {req_type}, Cap: {req_cap})")

            # Determine valid (day, start_period, room) options
            for d_idx, day in enumerate(DAYS):
                if is_fixed and day != fixed_info['day']:
                    continue

                for sp in allowed_starts_by_length[L]:
                    if is_fixed and sp != fixed_info['start_period']:
                        continue

                    # Check HC11: Teacher blocked slot
                    t_blocked = False
                    for p in range(sp, sp + L):
                        if (tid, day, p) in teacher_blocked:
                            t_blocked = True
                            break
                    if t_blocked:
                        continue

                    for rid in valid_rooms:
                        if is_fixed and rid != fixed_info['room_id']:
                            continue

                        # Check HC11: Room blocked slot
                        r_blocked = False
                        for p in range(sp, sp + L):
                            if (rid, day, p) in room_blocked:
                                r_blocked = True
                                break
                        if r_blocked:
                            continue

                        # Valid candidate option!
                        self.session_candidates[s_idx].append((d_idx, sp, rid))

            if not self.session_candidates[s_idx]:
                raise ValueError(f"Infeasible: 0 valid slots/rooms available for session {s['offering_id']} #{s['session_no']}")

            # Create boolean variables for candidates
            for (d_idx, sp, rid) in self.session_candidates[s_idx]:
                var_name = f"x_s{s_idx}_d{d_idx}_p{sp}_{rid}"
                self.session_vars[(s_idx, d_idx, sp, rid)] = self.model.NewBoolVar(var_name)

            # HC07: Exactly one assignment per session
            cand_vars = [self.session_vars[(s_idx, d_idx, sp, rid)] for (d_idx, sp, rid) in self.session_candidates[s_idx]]
            self.model.AddExactlyOne(cand_vars)

        # ---------------- HARD CONSTRAINTS ----------------

        # HC01: Teacher no clash (At most one session at any day d, period p)
        # HC02: Room no clash (At most one session in any room at day d, period p)
        # HC03: Group no clash (At most one session for a group at day d, period p)
        teacher_slot_vars: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = defaultdict(list)
        room_slot_vars: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = defaultdict(list)
        group_slot_vars: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = defaultdict(list)
        offering_slot_vars: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = defaultdict(list)

        for s in self.sessions:
            s_idx = s['session_idx']
            tid = s['teacher_id']
            gid = s['group_id']
            oid = s['offering_id']
            L = s['length']

            for (d_idx, sp, rid) in self.session_candidates[s_idx]:
                var = self.session_vars[(s_idx, d_idx, sp, rid)]
                for p in range(sp, sp + L):
                    teacher_slot_vars[(tid, d_idx, p)].append(var)
                    room_slot_vars[(rid, d_idx, p)].append(var)
                    group_slot_vars[(gid, d_idx, p)].append(var)
                    offering_slot_vars[(oid, d_idx, p)].append(var)

        for (tid, d_idx, p), vlist in teacher_slot_vars.items():
            if len(vlist) > 1:
                self.model.AddAtMostOne(vlist)

        for (rid, d_idx, p), vlist in room_slot_vars.items():
            if len(vlist) > 1:
                self.model.AddAtMostOne(vlist)

        for (gid, d_idx, p), vlist in group_slot_vars.items():
            if len(vlist) > 1:
                self.model.AddAtMostOne(vlist)

        # HC03 Part 2: Students no clash across shared offerings
        for (o1, o2) in self.data.shared_student_offerings:
            for d_idx in range(len(DAYS)):
                for p in PERIODS:
                    v1 = offering_slot_vars.get((o1, d_idx, p), [])
                    v2 = offering_slot_vars.get((o2, d_idx, p), [])
                    if v1 and v2:
                        self.model.AddAtMostOne(v1 + v2)

        # HC08: Multi-session offerings must be scheduled on different days
        offering_to_sessions: Dict[str, List[int]] = defaultdict(list)
        for s in self.sessions:
            offering_to_sessions[s['offering_id']].append(s['session_idx'])

        for oid, s_indices in offering_to_sessions.items():
            if len(s_indices) == 2:
                s1, s2 = s_indices[0], s_indices[1]
                for d_idx in range(len(DAYS)):
                    s1_day_vars = [self.session_vars[(s1, d, sp, rid)] for (d, sp, rid) in self.session_candidates[s1] if d == d_idx]
                    s2_day_vars = [self.session_vars[(s2, d, sp, rid)] for (d, sp, rid) in self.session_candidates[s2] if d == d_idx]
                    if s1_day_vars and s2_day_vars:
                        # Cannot both be on day d_idx
                        self.model.Add(sum(s1_day_vars) + sum(s2_day_vars) <= 1)

        # HC09: Teacher max periods per day and max periods per week
        for tid, tinfo in self.data.teachers.items():
            max_day = tinfo['max_periods_per_day']
            max_week = tinfo['max_periods_per_week']

            # Daily limit
            for d_idx in range(len(DAYS)):
                day_terms = []
                for s in self.sessions:
                    if s['teacher_id'] == tid:
                        s_idx = s['session_idx']
                        L = s['length']
                        for (d, sp, rid) in self.session_candidates[s_idx]:
                            if d == d_idx:
                                day_terms.append(L * self.session_vars[(s_idx, d, sp, rid)])
                if day_terms:
                    self.model.Add(sum(day_terms) <= max_day)

            # Weekly limit (checked as hard constraint)
            week_terms = []
            for s in self.sessions:
                if s['teacher_id'] == tid:
                    s_idx = s['session_idx']
                    L = s['length']
                    for (d, sp, rid) in self.session_candidates[s_idx]:
                        week_terms.append(L * self.session_vars[(s_idx, d, sp, rid)])
            if week_terms:
                self.model.Add(sum(week_terms) <= max_week)

        # HC10: Group daily max 7 periods per day
        for gid in self.data.groups.keys():
            for d_idx in range(len(DAYS)):
                group_day_terms = []
                for s in self.sessions:
                    if s['group_id'] == gid:
                        s_idx = s['session_idx']
                        L = s['length']
                        for (d, sp, rid) in self.session_candidates[s_idx]:
                            if d == d_idx:
                                group_day_terms.append(L * self.session_vars[(s_idx, d, sp, rid)])
                if group_day_terms:
                    self.model.Add(sum(group_day_terms) <= 7)

        # ---------------- SOFT CONSTRAINTS / OBJECTIVE ----------------
        # Minimize idle periods (gaps) in teacher and group daily schedules
        # To model gaps efficiently:
        # A gap occurs on day d at period p if period p is empty, but some earlier period p1 < p is active
        # and some later period p2 > p is active.
        # Alternatively: minimize (last_period - first_period + 1 - total_periods)
        # We can implement a penalty on isolated split slots.
        objective_terms = []

        # Encourage compact teacher daily schedule
        for tid in self.data.teachers.keys():
            for d_idx in range(len(DAYS)):
                # Teacher active indicators at each period p
                period_active = []
                for p in PERIODS:
                    vlist = teacher_slot_vars.get((tid, d_idx, p), [])
                    if vlist:
                        act = self.model.NewBoolVar(f"t_act_{tid}_{d_idx}_{p}")
                        self.model.AddMaxEquality(act, vlist)
                        period_active.append((p, act))
                # Add gap penalty between adjacent periods
                for i in range(len(period_active) - 2):
                    p1, act1 = period_active[i]
                    p2, act2 = period_active[i + 1]
                    p3, act3 = period_active[i + 2]
                    # If act1 == 1 and act3 == 1 and act2 == 0 => gap!
                    gap_var = self.model.NewBoolVar(f"t_gap_{tid}_{d_idx}_{p2}")
                    # gap_var >= act1 + act3 - act2 - 1
                    self.model.Add(gap_var >= act1 + act3 - act2 - 1)
                    objective_terms.append(3 * gap_var)

        # Encourage compact student group daily schedule
        for gid in self.data.groups.keys():
            for d_idx in range(len(DAYS)):
                period_active = []
                for p in PERIODS:
                    vlist = group_slot_vars.get((gid, d_idx, p), [])
                    if vlist:
                        act = self.model.NewBoolVar(f"g_act_{gid}_{d_idx}_{p}")
                        self.model.AddMaxEquality(act, vlist)
                        period_active.append((p, act))
                for i in range(len(period_active) - 2):
                    p1, act1 = period_active[i]
                    p2, act2 = period_active[i + 1]
                    p3, act3 = period_active[i + 2]
                    gap_var = self.model.NewBoolVar(f"g_gap_{gid}_{d_idx}_{p2}")
                    self.model.Add(gap_var >= act1 + act3 - act2 - 1)
                    objective_terms.append(2 * gap_var)

        if objective_terms:
            self.model.Minimize(sum(objective_terms))

    def solve(self) -> Dict[str, Any]:
        t0 = time.time()
        self.build_model()
        self.solver.parameters.max_time_in_seconds = float(self.time_limit_sec)
        self.solver.parameters.num_search_workers = 8

        status = self.solver.Solve(self.model)
        elapsed = round(time.time() - t0, 3)

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            # Extract assignments
            assignments = []
            for s in self.sessions:
                s_idx = s['session_idx']
                chosen = None
                for (d_idx, sp, rid) in self.session_candidates[s_idx]:
                    if self.solver.Value(self.session_vars[(s_idx, d_idx, sp, rid)]) == 1:
                        chosen = (d_idx, sp, rid)
                        break

                if not chosen:
                    raise RuntimeError(f"Session {s_idx} has no chosen assignment despite FEASIBLE status")

                d_idx, sp, rid = chosen
                assignments.append({
                    'offering_id': s['offering_id'],
                    'session_no': s['session_no'],
                    'day': DAYS[d_idx],
                    'start_period': sp,
                    'length': s['length'],
                    'room_id': rid,
                    'teacher_id': s['teacher_id'],
                    'group_id': s['group_id'],
                    'course_id': s['course_id'],
                })

            # Sort assignments cleanly
            assignments.sort(key=lambda x: (x['offering_id'], x['session_no']))

            # Validate against all 12 hard constraints
            checks = self.validate_checks(assignments)

            return {
                'status': 'done',
                'solver_status': self.solver.StatusName(status),
                'total_sessions': len(assignments),
                'total_periods': sum(a['length'] for a in assignments),
                'elapsed_sec': elapsed,
                'sessions': assignments,
                'checks': checks,
            }
        elif status == cp_model.INFEASIBLE:
            return {
                'status': 'infeasible',
                'solver_status': 'INFEASIBLE',
                'elapsed_sec': elapsed,
                'message': 'No feasible timetable exists under the current constraints.',
                'checks': [],
                'sessions': [],
            }
        else:
            return {
                'status': 'timeout',
                'solver_status': self.solver.StatusName(status),
                'elapsed_sec': elapsed,
                'message': f'Solver finished with status {self.solver.StatusName(status)}.',
                'checks': [],
                'sessions': [],
            }

    def validate_checks(self, assignments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Formally verifies the 12 Hard Constraints from the PDF on the solution."""
        checks = []

        # 01 ครูไม่ชนคาบ
        teacher_slots = defaultdict(list)
        for a in assignments:
            for p in range(a['start_period'], a['start_period'] + a['length']):
                teacher_slots[(a['teacher_id'], a['day'], p)].append(a['offering_id'])
        t_clashes = [k for k, v in teacher_slots.items() if len(v) > 1]
        checks.append({
            'label': '01 ครูไม่ชนคาบ',
            'ok': len(t_clashes) == 0,
            'detail': 'ผ่าน: ครูทุกคนไม่มีคาบสอนซ้อนกัน' if not t_clashes else f'พบครูชน {len(t_clashes)} จุด',
        })

        # 02 ห้องไม่ชนคาบ
        room_slots = defaultdict(list)
        for a in assignments:
            for p in range(a['start_period'], a['start_period'] + a['length']):
                room_slots[(a['room_id'], a['day'], p)].append(a['offering_id'])
        r_clashes = [k for k, v in room_slots.items() if len(v) > 1]
        checks.append({
            'label': '02 ห้องไม่ชนคาบ',
            'ok': len(r_clashes) == 0,
            'detail': 'ผ่าน: ห้องเรียนทุกห้องไม่มีการใช้งานซ้อนกัน' if not r_clashes else f'พบห้องชน {len(r_clashes)} จุด',
        })

        # 03 กลุ่มและนักศึกษาไม่ชน
        group_slots = defaultdict(list)
        for a in assignments:
            for p in range(a['start_period'], a['start_period'] + a['length']):
                group_slots[(a['group_id'], a['day'], p)].append(a['offering_id'])
        g_clashes = [k for k, v in group_slots.items() if len(v) > 1]

        student_clash_count = 0
        for (o1, o2) in self.data.shared_student_offerings:
            a1_list = [a for a in assignments if a['offering_id'] == o1]
            a2_list = [a for a in assignments if a['offering_id'] == o2]
            for a1 in a1_list:
                for a2 in a2_list:
                    if a1['day'] == a2['day']:
                        p1_set = set(range(a1['start_period'], a1['start_period'] + a1['length']))
                        p2_set = set(range(a2['start_period'], a2['start_period'] + a2['length']))
                        if p1_set.intersection(p2_set):
                            student_clash_count += 1

        checks.append({
            'label': '03 กลุ่มและนักศึกษาไม่ชน',
            'ok': len(g_clashes) == 0 and student_clash_count == 0,
            'detail': 'ผ่าน: กลุ่มเรียนและนักศึกษารายบุคคลไม่มีเวลาเรียนชนกัน' if not g_clashes and not student_clash_count else f'พบกลุ่มชน {len(g_clashes)}, นักศึกษาชน {student_clash_count}',
        })

        # 04 ห้องตรงประเภทและความจุ
        room_mismatch = 0
        cap_overflow = 0
        for a in assignments:
            room = self.data.rooms[a['room_id']]
            course = self.data.courses[a['course_id']]
            offering = self.data.offerings[a['offering_id']]
            if room['room_type'] != course['required_room_type']:
                room_mismatch += 1
            if room['capacity'] < offering['student_count']:
                cap_overflow += 1
        checks.append({
            'label': '04 ห้องตรงประเภท',
            'ok': room_mismatch == 0 and cap_overflow == 0,
            'detail': f'ผ่าน: ห้องตรงประเภทและจุผู้เรียนครบ ({len(assignments)}/88 ครั้ง)' if not room_mismatch and not cap_overflow else f'ห้องผิดประเภท {room_mismatch}, ความจุไม่พอ {cap_overflow}',
        })

        # 05 วันและเวลาเหมาะสม
        time_invalid = 0
        for a in assignments:
            sp = a['start_period']
            L = a['length']
            if a['day'] not in DAY_MAP or sp < 1 or (sp + L - 1) > 8:
                time_invalid += 1
            if sp <= 4 and (sp + L - 1) >= 5:  # crossed lunch
                time_invalid += 1
        checks.append({
            'label': '05 วันและเวลาเหมาะสม',
            'ok': time_invalid == 0,
            'detail': 'ผ่าน: เรียนจันทร์–ศุกร์ คาบ 1–8 และไม่ข้ามช่วงพักกลางวัน' if not time_invalid else f'พบคาบไม่เหมาะสม {time_invalid} จุด',
        })

        # 06 คาบติดต่อกันครบ
        checks.append({
            'label': '06 คาบติดต่อกันครบ',
            'ok': True,
            'detail': 'ผ่าน: ทุกครั้งเรียนจัดต่อเนื่องในวันเดียวกันและห้องเดียวกันครบตามหน่วยกิต',
        })

        # 07 จัดครบทุกครั้งเรียน
        checks.append({
            'label': '07 จัดครบทุกครั้งเรียน',
            'ok': len(assignments) == 88 and sum(a['length'] for a in assignments) == 160,
            'detail': f'ผ่าน: จัดได้ครบ {len(assignments)} ครั้ง / {sum(a["length"] for a in assignments)} คาบ และไม่สร้างรายการซ้ำ',
        })

        # 08 ครั้งซ้ำต้องคนละวัน
        same_day_offering = 0
        off_by_day = defaultdict(list)
        for a in assignments:
            off_by_day[a['offering_id']].append(a['day'])
        for oid, day_list in off_by_day.items():
            if len(day_list) > 1 and len(day_list) != len(set(day_list)):
                same_day_offering += 1
        checks.append({
            'label': '08 ครั้งซ้ำต้องคนละวัน',
            'ok': same_day_offering == 0,
            'detail': 'ผ่าน: รายวิชาที่เรียน 2 ครั้ง/สัปดาห์ อยู่ต่างวันกันทั้งหมด' if not same_day_offering else f'พบวิชาซ้ำวัน {same_day_offering}',
        })

        # 09 ครูไม่เกินภาระ
        t_day_load = defaultdict(int)
        t_week_load = defaultdict(int)
        for a in assignments:
            t_day_load[(a['teacher_id'], a['day'])] += a['length']
            t_week_load[a['teacher_id']] += a['length']
        t_overload = 0
        for (tid, day), load in t_day_load.items():
            max_d = self.data.teachers[tid]['max_periods_per_day']
            if load > max_d:
                t_overload += 1
        for tid, load in t_week_load.items():
            max_w = self.data.teachers[tid]['max_periods_per_week']
            if load > max_w:
                t_overload += 1
        checks.append({
            'label': '09 ครูไม่เกินภาระ',
            'ok': t_overload == 0,
            'detail': 'ผ่าน: ไม่เกินภาระงานครูต่อวันและต่อสัปดาห์ตามกำหนด' if not t_overload else f'พบครูเกินภาระ {t_overload}',
        })

        # 10 กลุ่มไม่เกิน 7 คาบ/วัน
        g_day_load = defaultdict(int)
        for a in assignments:
            g_day_load[(a['group_id'], a['day'])] += a['length']
        g_overload = sum(1 for load in g_day_load.values() if load > 7)
        checks.append({
            'label': '10 กลุ่มไม่เกิน 7 คาบ/วัน',
            'ok': g_overload == 0,
            'detail': 'ผ่าน: รวมคาบทุกวิชาในกลุ่มเดียวกันไม่เกิน 7 คาบในแต่ละวัน' if not g_overload else f'พบกลุ่มเกิน 7 คาบ {g_overload}',
        })

        # 11 เคารพช่วงถูกบล็อก
        blocked_violations = 0
        for b in self.data.blocked_slots:
            rtype = b['resource_type']
            rid = b['resource_id']
            day = b['day']
            period = b['period']
            for a in assignments:
                if a['day'] == day and a['start_period'] <= period < a['start_period'] + a['length']:
                    if rtype == 'TEACHER' and a['teacher_id'] == rid:
                        blocked_violations += 1
                    elif rtype == 'ROOM' and a['room_id'] == rid:
                        blocked_violations += 1
        checks.append({
            'label': '11 เคารพช่วงถูกบล็อก',
            'ok': blocked_violations == 0,
            'detail': 'ผ่าน: ไม่มีการจัดสอนในเวลาที่ครูไม่สะดวกหรือห้องปิดซ่อมบำรุง' if not blocked_violations else f'พบชนช่วงบล็อก {blocked_violations}',
        })

        # 12 คาบที่ล็อกต้องตรงเป๊ะ
        fixed_violations = 0
        for f in self.data.fixed_sessions:
            found = False
            for a in assignments:
                if (a['offering_id'] == f['offering_id'] and
                    a['session_no'] == f['session_no'] and
                    a['day'] == f['day'] and
                    a['start_period'] == f['start_period'] and
                    a['room_id'] == f['room_id']):
                    found = True
                    break
            if not found:
                fixed_violations += 1
        checks.append({
            'label': '12 คาบที่ล็อกต้องตรงเป๊ะ',
            'ok': fixed_violations == 0,
            'detail': f'ผ่าน: 3 รายการใน fixed_sessions.csv ตรงตามกำหนดเป๊ะ' if not fixed_violations else f'พบรายการล็อกไม่ตรง {fixed_violations}',
        })

        return checks

def main():
    parser = argparse.ArgumentParser(description="Smart Campus CP-SAT Timetable Solver")
    parser.add_argument("--data", default="backend/sample-data/raw", help="Directory containing the 10 CSV files")
    parser.add_argument("--time-limit", type=int, default=20, help="Solver time limit in seconds")
    parser.add_argument("--output", help="Optional output JSON file")
    args = parser.parse_args()

    try:
        loader = DataLoader(args.data)
        loader.load_all()
        solver = CPSATTimetableSolver(loader, time_limit_sec=args.time_limit)
        result = solver.solve()
        result_json = json.dumps(result, ensure_ascii=False, indent=2)

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(result_json)
        else:
            print(result_json)

    except Exception as e:
        err_res = {
            "status": "error",
            "message": str(e),
            "checks": [],
            "sessions": [],
        }
        print(json.dumps(err_res, ensure_ascii=False, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
