# Smart Campus Timetable – Backend (Node.js + Express)

REST API + scheduling engine for MOCK-60-01. Frontend (Vue + Vite + Tailwind) is separate.

```bash
npm install
npm start          # http://localhost:3000   (PORT env to change)
npm test           # 9 tests: cleaning, 12 constraints, tamper detection, infeasibility, Firestore persistence
```

## Flow your frontend follows
1. `POST /api/datasets` (upload) → cleaning report + preview  
2. `POST /api/datasets/:id/solve` → `{ id: jobId }`  
3. poll `GET /api/jobs/:jobId` until `status != running` (shows `progress.percent/message`)  
4. read views: `GET /api/jobs/:jobId/timetable/group/G01`, etc.  
5. download: `GET /api/jobs/:jobId/export/solution.csv`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness check |
| GET | `/api/templates` · `/api/templates/:name.csv` · `/api/templates/all.zip` | template files + column spec |
| POST | `/api/datasets` | multipart (field any name): CSV files and/or a ZIP of CSVs; **or** JSON `{groups:[…], teachers:[…], …}`. Returns 201 (ok) / 422 (blocking errors) with `report` |
| POST | `/api/datasets/import-firestore` | body `{prefix?, name?}` – read input tables from Firestore collections `<prefix>groups`, `<prefix>teachers`, … (501 if Firebase is not configured) |
| POST | `/api/datasets/sample` | load bundled (dirty) sample data |
| GET | `/api/datasets` · `/:id` · `/:id/report` · `/:id/preflight` | metadata, full cleaning report, feasibility analysis |
| GET | `/api/datasets/:id/preview/:table?limit=&offset=` | cleaned table rows (Preview page) |
| GET | `/api/datasets/:id/cleaned.zip` | download cleaned CSVs |
| POST | `/api/datasets/:id/solve` | body `{timeLimitSec?, seed?, optimize?, optimizeSec?}` → **202** job |
| POST | `/api/datasets/:id/validate-solution` | upload any `solution.csv` (field `file`) or JSON `{assignments}` → 12-constraint check |
| GET | `/api/jobs` · `/api/jobs/:id` | job list / status + progress + summary |
| POST | `/api/jobs/:id/cancel` · DELETE `/api/jobs/:id` | cancel / remove |
| GET | `/api/jobs/:id/result` | raw assignments + validation + stats |
| GET | `/api/jobs/:id/validation` | re-run validator → `checks[C01..C12]` pass/fail + violations |
| GET | `/api/jobs/:id/stats` | per group/teacher/room periods, gaps, room utilisation |
| GET | `/api/jobs/:id/entries?group=&teacher=&room=&day=&course=&q=&limit=&offset=` | flat filterable/searchable list |
| GET | `/api/jobs/:id/timetable/:view` | keys for dropdown (`view` = group \| teacher \| room) |
| GET | `/api/jobs/:id/timetable/:view/:key` | grid: `rows[period].cells[dayIndex]` = `{entry, startsHere, offset}` or `null` |
| GET | `/api/jobs/:id/export/solution.csv` | **official schema**, no BOM: `offering_id,session_no,day,start_period,room_id` |
| GET | `/api/jobs/:id/export/timetable.csv` | readable export (UTF-8 BOM for Excel), same filters as `/entries` |
| GET | `/api/jobs/:id/export/solution.json` | JSON export |

Job `status`: `running` · `succeeded` · `infeasible` · `not_found` (time limit, *not* a proof) · `failed` · `cancelled`.  
When not `succeeded`, `summary.explanation` holds `summary`, `reasons[]`, `advice[]` (shown to the user instead of a bad timetable).

## Algorithm (for the presentation)
1. **Cleaner** – BOM, full-width/Thai digits, case, units ("20 คาบ"), duplicates, broken FKs (`C-103`→`C103`), contradictory counts (`250`→`25` using enrollments as evidence). Every change is logged in `report.fixes`.
2. **Pre-flight** – proves infeasibility early (teacher load vs limit/availability, room-type supply vs demand, illegal fixed sessions…).
3. **CSP solver** – backtracking with *most-constrained-first* (MRV) ordering, forward checking, randomised restarts with growing node limits. A full exhausted search = proof of infeasibility.
4. **Local search** – single-session moves reduce group/teacher idle gaps and balance daily load.
5. **Independent validator** – re-checks all 12 hard constraints per student; the job only reports `succeeded` if validation passes.

Sample data: 88/88 sessions, 160/160 periods, solved in ~85 search nodes, 30/30 seeds valid (<300 ms without optimisation).

## Firebase / Firestore
Set ONE of the credential options in `.env.example` and restart. `GET /api/health` then shows `"storage":"firestore"`
(otherwise `"memory"`, and data is lost on restart).

* **What is stored:** cleaned datasets, cleaning reports, jobs and their results (so a timetable can still be viewed/downloaded after a restart or redeploy).
  Collections: `sc_datasets/{id}` and `sc_jobs/{id}`, each with a `blobs` subcollection holding chunked JSON
  (avoids Firestore's 1 MiB document limit, nested-array and `undefined` restrictions).
* **Input from Firestore:** if your teacher/room/etc. data already lives in Firestore collections named `groups`, `teachers`, `rooms`, `courses`,
  `offerings`, `timeslots`, `blocked_slots`, `fixed_sessions`, `students`, `enrollments`, call `POST /api/datasets/import-firestore`.
  Documents are field-per-column (same names as the CSV headers); the same cleaning pipeline runs on them.
* **Security:** the backend uses the Admin SDK, which bypasses Firestore security rules. If only this backend touches `sc_*`, set rules to deny all client access:
  `match /{document=**} { allow read, write: if false; }`. Keep the service-account key out of git (`.env` is git-ignored).
* **Indexes:** none needed (only single-field `orderBy`).
* A job that was `running` when the server stopped is reported as `failed` ("server restarted") rather than hanging forever. Run one backend instance per database.

## Deploy (Cloud)
`Dockerfile` included (Render / Railway / Cloud Run / Fly). Set `CORS_ORIGIN` to your frontend URL, or build Vue and set
`FRONTEND_DIST=../frontend/dist` to serve both from one service. Without Firebase credentials, state is in memory and a restart clears it.
