<script setup>
import { computed, ref } from 'vue'
import axios from 'axios'
import { useScheduleStore } from '../stores/schedule'
import { downloadText } from '../utils/download'
import { captureCards, savePng, savePdf, saveWorkbook } from '../utils/exporters'
import { nameOf } from '../mock/data'
import TimetableCard from '../components/TimetableCard.vue'

const store = useScheduleStore()

const esc = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function solutionCsv() {
  if (store.currentJobId) {
    try {
      const { data } = await axios.get(`/api/export/solution.csv?jobId=${store.currentJobId}`, { responseType: 'text' })
      downloadText('solution.csv', data)
      return
    } catch (e) {
      console.warn('Backend export failed, falling back to local:', e.message)
    }
  }
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

// ---------- ตารางรายกลุ่ม (PNG / PDF) ----------
const groups = computed(() => {
  const ids = [...new Set(store.sessions.map((s) => s.group_id))].sort()
  return ids.map((id) => {
    const list = store.sessions.filter((s) => s.group_id === id)
    return {
      id,
      name: nameOf('group', id),
      sessions: list,
      label: `${list.length} ครั้งเรียน · ${list.reduce((n, s) => n + s.length, 0)} คาบ`,
    }
  })
})

const pickedGroup = ref('')
const currentGroup = computed(() => groups.value.find((g) => g.id === pickedGroup.value) ?? groups.value[0])

const describeGroup = (s) => ({
  title: nameOf('course', s.course_id),
  sub: `${nameOf('teacher', s.teacher_id)} · ${nameOf('room', s.room_id)}`,
})

// เก็บตารางที่ซ่อนไว้นอกจอ เพื่อถ่ายเป็นรูป
const cardComps = {}
const setCardRef = (id, comp) => { if (comp) cardComps[id] = comp; else delete cardComps[id] }
const elOf = (g) => cardComps[g.id]?.card

const busy = ref('')
const failed = ref('')
async function run(key, fn) {
  busy.value = key
  failed.value = ''
  try {
    await fn()
  } catch (e) {
    console.error('Export failed:', e)
    failed.value = 'สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง'
  } finally {
    busy.value = ''
  }
}

const groupPng = () => run('png', async () => {
  const g = currentGroup.value
  const [shot] = await captureCards([elOf(g)])
  savePng(shot.url, `timetable-${g.id}.png`)
})
const groupPdf = () => run('pdf', async () => {
  const g = currentGroup.value
  await savePdf(await captureCards([elOf(g)]), `timetable-${g.id}.pdf`)
})
const allPdf = () => run('pdf-all', async () => {
  await savePdf(await captureCards(groups.value.map(elOf)), 'timetable-all-groups.pdf')
})
const excel = () => run('xlsx', () => saveWorkbook(store.sessions))

const items = [
  { title: 'solution.csv', desc: 'ไฟล์คำตอบตามสคีมาของโจทย์ 1 แถวต่อ 1 ครั้งเรียน', action: solutionCsv },
  { title: 'ตารางทั้งหมด (CSV)', desc: 'รายการครั้งเรียนพร้อมชื่อวิชา กลุ่ม ครู ห้อง เปิดใน Excel ได้', action: scheduleCsv },
  { key: 'xlsx', title: 'ตารางทั้งหมด (Excel)', desc: 'ไฟล์ .xlsx มีชีตรวมทุกครั้งเรียน และชีตตารางแยกรายกลุ่ม', action: excel },
  { key: 'pdf-all', title: 'ตารางทุกกลุ่ม (PDF)', desc: 'PDF หน้าละ 1 กลุ่ม เหมาะกับการพิมพ์', action: allPdf },
]
</script>

<template>
  <h1 class="text-2xl font-bold text-leaf-900">ส่งออก</h1>
  <p class="mt-1 text-ink-soft">ดาวน์โหลดผลการจัดตารางไปส่งหรือเปิดดูต่อ</p>

  <div v-if="!store.sessions.length" class="mt-6 rounded-2xl border border-dashed border-leaf-200 bg-paper px-6 py-14 text-center">
    <p class="font-semibold">ยังไม่มีตารางให้ส่งออก</p>
    <RouterLink to="/generate" class="mt-4 inline-block rounded-xl bg-leaf-600 px-5 py-2.5 font-semibold text-white hover:bg-leaf-700">ไปจัดตาราง</RouterLink>
  </div>

  <template v-else>
    <ul class="mt-6 grid gap-4 sm:grid-cols-2">
      <li v-for="i in items" :key="i.title" class="flex flex-col rounded-2xl border border-line bg-paper p-5">
        <h2 class="font-semibold">{{ i.title }}</h2>
        <p class="mt-1 flex-1 text-sm text-ink-soft">{{ i.desc }}</p>
        <button class="mt-4 self-start rounded-xl bg-leaf-600 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-60"
          :disabled="!!busy" @click="i.action">{{ busy && busy === i.key ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด' }}</button>
      </li>
    </ul>

    <section class="mt-4 rounded-2xl border border-line bg-paper p-5">
      <h2 class="font-semibold">ตารางรายกลุ่ม</h2>
      <p class="mt-1 text-sm text-ink-soft">เลือกกลุ่ม แล้วดาวน์โหลดเป็นรูป PNG หรือ PDF</p>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <select :value="currentGroup?.id" aria-label="เลือกกลุ่ม"
          class="rounded-xl border border-line bg-paper px-3 py-2 text-sm" @change="pickedGroup = $event.target.value">
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <button class="rounded-xl bg-leaf-600 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-60"
          :disabled="!!busy" @click="groupPng">{{ busy === 'png' ? 'กำลังสร้างรูป...' : 'ดาวน์โหลดรูป PNG' }}</button>
        <button class="rounded-xl border border-leaf-300 px-4 py-2 text-sm font-semibold text-leaf-800 hover:bg-leaf-50 disabled:opacity-60"
          :disabled="!!busy" @click="groupPdf">{{ busy === 'pdf' ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF' }}</button>
      </div>
      <p v-if="failed" role="alert" class="mt-3 text-sm text-warn">{{ failed }}</p>
    </section>

    <!-- ตารางของทุกกลุ่ม ซ่อนไว้นอกจอ ใช้ถ่ายเป็นรูปสำหรับ PNG/PDF -->
    <div aria-hidden="true" style="position: fixed; left: -10000px; top: 0">
      <TimetableCard v-for="g in groups" :key="g.id" :ref="(c) => setCardRef(g.id, c)"
        :sessions="g.sessions" heading="ตารางเรียน" :left-label="g.name" :right-label="g.label" :describe="describeGroup" />
    </div>
  </template>
</template>