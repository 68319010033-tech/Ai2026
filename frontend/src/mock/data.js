// ข้อมูลตัวอย่างสำหรับพัฒนา UI ระหว่างรอ backend (ไม่ใช่ข้อมูลจริงของโจทย์)
export const days = [
  { key: 'MON', label: 'จันทร์' },
  { key: 'TUE', label: 'อังคาร' },
  { key: 'WED', label: 'พุธ' },
  { key: 'THU', label: 'พฤหัสบดี' },
  { key: 'FRI', label: 'ศุกร์' },
]

export const periods = [
  { n: 1, time: '08.00–09.00' }, { n: 2, time: '09.00–10.00' },
  { n: 3, time: '10.00–11.00' }, { n: 4, time: '11.00–12.00' },
  { n: 5, time: '13.00–14.00' }, { n: 6, time: '14.00–15.00' },
  { n: 7, time: '15.00–16.00' }, { n: 8, time: '16.00–17.00' },
]

export const groups = ['1/1', '1/2', '1/3', '1/4', '2/1', '2/2', '2/3', '2/4'].map((c, i) => ({
  id: `G0${i + 1}`, name: `ปวส.${c}`,
}))

const tn = ['สมชาย', 'สุดา', 'วิชัย', 'มาลี', 'ประเสริฐ', 'นภา', 'อนันต์', 'กมล',
  'สุภาพ', 'ธนา', 'พรทิพย์', 'ชัยวัฒน์', 'รัตนา', 'อดิศร', 'ปิยะ', 'จันทร์เพ็ญ']
export const teachers = tn.map((n, i) => ({ id: `T${String(i + 1).padStart(2, '0')}`, name: `อ.${n}` }))

export const rooms = [
  { id: 'R01', name: 'ห้องคอม 1', type: 'COMPUTER' }, { id: 'R02', name: 'ห้องคอม 2', type: 'COMPUTER' },
  { id: 'R03', name: 'ห้องเครือข่าย 1', type: 'NETWORK' }, { id: 'R04', name: 'ห้องเครือข่าย 2', type: 'NETWORK' },
  { id: 'R05', name: 'ห้องเรียนรวม 1', type: 'GENERAL' }, { id: 'R06', name: 'ห้องมีเดีย 1', type: 'MEDIA' },
  { id: 'R07', name: 'ห้องเรียนรวม 2', type: 'GENERAL' }, { id: 'R08', name: 'ห้องมีเดีย 2', type: 'MEDIA' },
]

export const courses = [
  { id: 'C101', name: 'การเขียนโปรแกรม' }, { id: 'C102', name: 'เครือข่ายคอมพิวเตอร์' },
  { id: 'C103', name: 'ฐานข้อมูล' }, { id: 'C104', name: 'คณิตศาสตร์' },
  { id: 'C105', name: 'ภาษาอังกฤษ' }, { id: 'C106', name: 'สื่อดิจิทัล' },
  { id: 'C107', name: 'เว็บเทคโนโลยี' },
]

const S = (offering_id, session_no, day, start_period, length, room_id, teacher_id, group_id, course_id) =>
  ({ offering_id, session_no, day, start_period, length, room_id, teacher_id, group_id, course_id })

export const mockSessions = [
  S('O001', 1, 'MON', 1, 2, 'R01', 'T01', 'G01', 'C101'), S('O001', 2, 'WED', 1, 2, 'R01', 'T01', 'G01', 'C101'),
  S('O002', 1, 'TUE', 1, 3, 'R03', 'T02', 'G01', 'C102'), S('O003', 1, 'THU', 5, 3, 'R01', 'T03', 'G01', 'C103'),
  S('O004', 1, 'FRI', 1, 2, 'R05', 'T04', 'G01', 'C104'),
  S('O010', 1, 'MON', 1, 3, 'R02', 'T03', 'G02', 'C103'), S('O011', 1, 'TUE', 5, 2, 'R05', 'T05', 'G02', 'C105'),
  S('O012', 1, 'WED', 5, 3, 'R03', 'T02', 'G02', 'C102'), S('O013', 1, 'THU', 1, 2, 'R01', 'T01', 'G02', 'C101'),
  S('O020', 1, 'MON', 5, 3, 'R06', 'T06', 'G03', 'C106'), S('O021', 1, 'TUE', 1, 2, 'R05', 'T04', 'G03', 'C104'),
  S('O022', 1, 'THU', 1, 3, 'R02', 'T07', 'G03', 'C107'), S('O023', 1, 'FRI', 3, 2, 'R05', 'T08', 'G03', 'C105'),
  S('O030', 1, 'TUE', 5, 3, 'R02', 'T07', 'G04', 'C107'), S('O031', 1, 'WED', 1, 3, 'R06', 'T06', 'G04', 'C106'),
  S('O032', 1, 'FRI', 5, 2, 'R05', 'T04', 'G04', 'C104'),
]

export const hardConstraints = [
  'ครูไม่สอนซ้อนคาบ', 'ห้องไม่ถูกใช้ซ้อนคาบ', 'กลุ่มและนักศึกษาไม่เรียนชนกัน',
  'ประเภทห้องตรงวิชาและความจุพอ', 'อยู่ในวัน–คาบที่กำหนด ไม่คร่อมพักเที่ยง',
  'วิชา 3 คาบต่อเนื่องในห้องเดียวกัน', 'จัดครบทุกครั้งเรียน ไม่ซ้ำ',
  'วิชาที่เรียน 2 ครั้ง/สัปดาห์ อยู่คนละวัน', 'ไม่เกินภาระงานครูต่อวัน/สัปดาห์',
  'กลุ่มเรียนไม่เกิน 7 คาบต่อวัน', 'ไม่ชนเวลาที่ครูไม่สะดวกหรือห้องปิด', 'ครั้งเรียนที่ล็อกไว้ตรงตามกำหนด',
]

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
const maps = { group: byId(groups), teacher: byId(teachers), room: byId(rooms), course: byId(courses) }
export const nameOf = (kind, id) => maps[kind][id]?.name ?? id

// สีประจำวิชา: ไล่เฉดในโทนเขียว (เหลืองเขียว → เขียวน้ำทะเล) ให้แยกวิชาได้ด้วยตา
export const courseHue = (id) => 70 + (parseInt(id.replace(/\D/g, ''), 10) % 100 % 8) * 16
