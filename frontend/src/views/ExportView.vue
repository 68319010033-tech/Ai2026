<script setup>
import { useScheduleStore } from '../stores/schedule'
import { downloadText } from '../utils/download'
import { nameOf } from '../mock/data'

const store = useScheduleStore()

const esc = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function solutionCsv() {
  const rows = [...store.sessions]
    .sort((a, b) => a.offering_id.localeCompare(b.offering_id) || a.session_no - b.session_no)
    .map((s) => [s.offering_id, s.session_no, s.day, s.start_period, s.room_id].join(','))
  downloadText('solution.csv', ['offering_id,session_no,day,start_period,room_id', ...rows].join('\n') + '\n')
}

function scheduleCsv() {
  const head = 'วิชา,กลุ่ม,ครู,ห้อง,วัน,คาบเริ่ม,จำนวนคาบ'
  const rows = store.sessions.map((s) =>
    [nameOf('course', s.course_id), nameOf('group', s.group_id), nameOf('teacher', s.teacher_id),
       nameOf('room', s.room_id), s.day, s.start_period, s.length].map(esc).join(','))
  downloadText('schedule.csv', [head, ...rows].join('\n') + '\n', { bom: true }) // bom ให้ Excel อ่านภาษาไทยถูก
}

const items = [
  { title: 'solution.csv', desc: 'ไฟล์คำตอบตามสคีมาของโจทย์ 1 แถวต่อ 1 ครั้งเรียน', action: solutionCsv },
  { title: 'ตารางทั้งหมด (CSV)', desc: 'รายการครั้งเรียนพร้อมชื่อวิชา กลุ่ม ครู ห้อง เปิดใน Excel ได้', action: scheduleCsv },
]
</script>

<template>
  <h1 class="text-2xl font-bold text-leaf-900">ส่งออก</h1>
  <p class="mt-1 text-ink-soft">ดาวน์โหลดผลการจัดตารางไปส่งหรือเปิดดูต่อ</p>

  <div v-if="!store.sessions.length" class="mt-6 rounded-2xl border border-dashed border-leaf-200 bg-paper px-6 py-14 text-center">
    <p class="font-semibold">ยังไม่มีตารางให้ส่งออก</p>
    <RouterLink to="/generate" class="mt-4 inline-block rounded-xl bg-leaf-600 px-5 py-2.5 font-semibold text-white hover:bg-leaf-700">ไปจัดตาราง</RouterLink>
  </div>

  <ul v-else class="mt-6 grid gap-4 sm:grid-cols-2">
    <li v-for="i in items" :key="i.title" class="flex flex-col rounded-2xl border border-line bg-paper p-5">
      <h2 class="font-semibold">{{ i.title }}</h2>
      <p class="mt-1 flex-1 text-sm text-ink-soft">{{ i.desc }}</p>
      <button class="mt-4 self-start rounded-xl bg-leaf-600 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-700"
        @click="i.action">ดาวน์โหลด</button>
    </li>
  </ul>
</template>
