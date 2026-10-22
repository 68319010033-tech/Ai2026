เรื่อง API ขอตกลงกัน 3 อย่าง

1) Endpoint + พอร์ต (Express ฟังพอร์ตอะไร?)
POST /api/import          รับ CSV  → { ok, errors: [{file,row,message}] }
POST /api/generate        → { jobId }
GET  /api/status/:jobId   → { state, progress, message }
GET  /api/schedule/:jobId → { sessions, checks }
GET  /api/export/solution.csv

2) session แต่ละรายการ
{ offering_id, session_no, day, start_period, length,
  room_id, teacher_id, group_id, course_id }
day = MON|TUE|WED|THU|FRI

3) state ของ job
running | done | infeasible | timeout | error

checks = [{ label, ok, detail }] (ผลตรวจ hard constraints 12 ข้อ)
ถ้า infeasible ช่วยส่งเหตุผลมาใน message ด้วย
