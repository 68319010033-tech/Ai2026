<script setup>
// frontend/src/components/TimetableCard.vue  (ไฟล์ใหม่)
// ตารางเรียนแนวนักเรียน: แถว = วัน, คอลัมน์ = คาบ, วิชาเดียวกันสีเดียวกัน, ดาวน์โหลดเป็นรูป PNG ได้
import { ref, computed } from 'vue'
import { toPng } from 'html-to-image'

const props = defineProps({
  // [{ day:'MON', start_period:1, length:2, course_id:'C101', ... }]
  sessions: { type: Array, default: () => [] },
  heading: { type: String, default: 'ตารางเรียน' },
  // ข้อความในแคปซูลล่างซ้าย/ขวา เช่น ชื่อกลุ่ม, สรุปจำนวนคาบ
  leftLabel: { type: String, default: '' },
  rightLabel: { type: String, default: '' },
  // (session) => ({ title: 'ชื่อวิชา', sub: 'ครู · ห้อง' })  ให้หน้าที่เรียกใช้กำหนดข้อความเอง
  describe: { type: Function, default: (s) => ({ title: s.course_id, sub: '' }) },
})

const DAYS = [
  { key: 'MON', label: 'จันทร์', color: '#fde68a' },
  { key: 'TUE', label: 'อังคาร', color: '#fbcfe8' },
  { key: 'WED', label: 'พุธ', color: '#bbf7d0' },
  { key: 'THU', label: 'พฤหัสบดี', color: '#fdba74' },
  { key: 'FRI', label: 'ศุกร์', color: '#93c5fd' },
]
const TIMES = ['08:00–09:00', '09:00–10:00', '10:00–11:00', '11:00–12:00',
               '13:00–14:00', '14:00–15:00', '15:00–16:00', '16:00–17:00']
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

// สีวิชา: พื้นอ่อน + ขอบซ้ายเข้ม  (course_id เดียวกัน = สีเดียวกันเสมอ ทุกมุมมอง)
const PALETTE = [
  ['#fecdd3', '#e11d48'], ['#fed7aa', '#ea580c'], ['#fef08a', '#ca8a04'],
  ['#bbf7d0', '#16a34a'], ['#99f6e4', '#0d9488'], ['#bae6fd', '#0284c7'],
  ['#c7d2fe', '#4f46e5'], ['#e9d5ff', '#9333ea'], ['#fbcfe8', '#db2777'],
  ['#d9f99d', '#65a30d'],
]
function colorOf(courseId) {
  const digits = String(courseId).replace(/\D/g, '')
  let n = digits ? parseInt(digits, 10) : 0
  if (!digits) for (const ch of String(courseId)) n += ch.charCodeAt(0)
  return PALETTE[n % PALETTE.length]
}

// คอลัมน์ที่ 1 = ชื่อวัน, คาบ 1–4 = คอลัมน์ 2–5, คอลัมน์ 6 = พักกลางวัน, คาบ 5–8 = คอลัมน์ 7–10
const colOf = (p) => (p <= 4 ? p + 1 : p + 2)
const dayRow = (key) => DAYS.findIndex((d) => d.key === key) + 2

const blocks = computed(() =>
  props.sessions
    .filter((s) => dayRow(s.day) >= 2)
    .map((s, i) => {
      const [bg, accent] = colorOf(s.course_id)
      const d = props.describe(s)
      return {
        id: `${s.offering_id ?? i}-${s.session_no ?? i}`,
        title: d.title,
        sub: d.sub,
        style: {
          gridRow: dayRow(s.day),
          gridColumn: `${colOf(s.start_period)} / span ${s.length}`,
          background: bg,
          borderLeftColor: accent,
        },
      }
    }),
)

const card = ref(null)
defineExpose({ card })
const busy = ref(false)
async function exportPng() {
  if (!card.value || busy.value) return
  busy.value = true
  const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: '#dbeafe' }
  try {
    let url
    try {
      url = await toPng(card.value, opts)
    } catch {
      // ถ้าโหลดฟอนต์จาก Google Fonts ฝังลงรูปไม่ได้ ลองใหม่โดยข้ามฟอนต์
      url = await toPng(card.value, { ...opts, skipFonts: true })
    }
    const a = document.createElement('a')
    a.href = url
    a.download = `timetable-${(props.leftLabel || 'schedule').replace(/[^\w\u0E00-\u0E7F.-]+/g, '_')}.png`
    a.click()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-3 flex justify-end">
      <button
        type="button"
        class="rounded-xl bg-leaf-700 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-800 disabled:opacity-60"
        :disabled="busy"
        @click="exportPng"
      >
        {{ busy ? 'กำลังสร้างรูป...' : 'ดาวน์โหลดเป็นรูป' }}
      </button>
    </div>

    <div class="overflow-x-auto">
      <div ref="card" class="tt-card">
        <div class="tt-title"><span>{{ heading }}</span></div>

        <div class="tt-grid">
          <!-- หัวตาราง -->
          <div class="tt-head tt-corner" style="grid-row: 1; grid-column: 1">เวลา</div>
          <div
            v-for="p in PERIODS"
            :key="'h' + p"
            class="tt-head"
            :style="{ gridRow: 1, gridColumn: colOf(p) }"
          >
            {{ TIMES[p - 1] }}
          </div>
          <div class="tt-head tt-lunch-head" style="grid-row: 1; grid-column: 6">พัก</div>

          <!-- ชื่อวัน + ช่องว่าง -->
          <template v-for="(d, di) in DAYS" :key="d.key">
            <div
              class="tt-day"
              :style="{ gridRow: di + 2, gridColumn: 1, background: d.color }"
            >
              {{ d.label }}
            </div>
            <div
              v-for="p in PERIODS"
              :key="d.key + p"
              class="tt-cell"
              :style="{ gridRow: di + 2, gridColumn: colOf(p) }"
            />
          </template>

          <!-- แถบพักกลางวัน -->
          <div class="tt-lunch" style="grid-row: 2 / 7; grid-column: 6">
            <span>พักกลางวัน 12:00–13:00</span>
          </div>

          <!-- วิชา -->
          <div v-for="b in blocks" :key="b.id" class="tt-block" :style="b.style">
            <strong>{{ b.title }}</strong>
            <small v-if="b.sub">{{ b.sub }}</small>
          </div>
        </div>

        <div class="tt-foot">
          <span class="tt-pill">{{ leftLabel }}</span>
          <span class="tt-pill">{{ rightLabel }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tt-card {
  min-width: 880px;
  padding: 22px 24px 20px;
  border-radius: 20px;
  background:
    linear-gradient(rgba(255, 255, 255, 0.35) 1px, transparent 1px) 0 0 / 22px 22px,
    linear-gradient(90deg, rgba(255, 255, 255, 0.35) 1px, transparent 1px) 0 0 / 22px 22px,
    #cfe3f7;
  color: #1e3a6e;
}
.tt-title {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}
.tt-title span {
  padding: 8px 34px;
  border-radius: 16px;
  background: #fff;
  font-size: 1.7rem;
  font-weight: 700;
  color: #1e3a8a;
}
.tt-grid {
  display: grid;
  grid-template-columns: 86px repeat(4, minmax(0, 1fr)) 34px repeat(4, minmax(0, 1fr));
  grid-template-rows: 36px repeat(5, minmax(78px, auto));
  background: #fff;
  border-radius: 6px;
  overflow: hidden;
}
.tt-head {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #a9c8e8;
  font-size: 0.74rem;
  font-weight: 600;
  color: #1e3a6e;
  border-left: 1px solid #fff;
}
.tt-corner { font-size: 0.85rem; border-left: 0; }
.tt-lunch-head { font-size: 0.7rem; }
.tt-day {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 3px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.95rem;
  color: #1e3a6e;
}
.tt-cell {
  border-left: 1px dashed #c3d3e4;
  border-top: 1px dashed #c3d3e4;
}
.tt-lunch {
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(135deg, #f1f5f9, #f1f5f9 6px, #e8eef5 6px, #e8eef5 12px);
  border-left: 1px solid #c3d3e4;
  border-right: 1px solid #c3d3e4;
}
.tt-lunch span {
  writing-mode: vertical-rl;
  font-size: 0.72rem;
  font-weight: 600;
  color: #5b708f;
  letter-spacing: 0.04em;
}
.tt-block {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  margin: 3px;
  padding: 6px 10px;
  border-radius: 8px;
  border-left: 5px solid;
  color: #1f2937;
  overflow: hidden;
  z-index: 1;
}
.tt-block strong { font-size: 0.86rem; line-height: 1.25; overflow-wrap: anywhere; }
.tt-block small { font-size: 0.72rem; line-height: 1.3; color: #4b5563; overflow-wrap: anywhere; }
.tt-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}
.tt-pill {
  min-width: 220px;
  padding: 7px 22px;
  border: 1.5px solid #1e3a6e;
  border-radius: 999px;
  background: #fff;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e3a6e;
}
</style>
