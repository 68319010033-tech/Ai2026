<script setup>
import { computed } from 'vue'
import { days, periods, nameOf, courseHue } from '../mock/data'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  mode: { type: String, default: 'group' }, // group | teacher | room
})

// คอลัมน์ 1 = ป้ายวัน, คาบ 1–4 = คอลัมน์ 2–5, พักเที่ยง = คอลัมน์ 6, คาบ 5–8 = คอลัมน์ 7–10
const colOf = (p) => (p <= 4 ? p + 1 : p + 2)

const cells = computed(() =>
  days.flatMap((d, i) => periods.map((p) => ({ key: `${d.key}${p.n}`, row: i + 2, col: colOf(p.n) }))),
)

const blocks = computed(() =>
  props.sessions.map((s) => ({
    key: `${s.offering_id}-${s.session_no}`,
    title: nameOf('course', s.course_id),
    lines: {
      group: [nameOf('teacher', s.teacher_id), nameOf('room', s.room_id)],
      teacher: [nameOf('group', s.group_id), nameOf('room', s.room_id)],
      room: [nameOf('group', s.group_id), nameOf('teacher', s.teacher_id)],
    }[props.mode],
    style: {
      gridRow: days.findIndex((d) => d.key === s.day) + 2,
      gridColumn: `${colOf(s.start_period)} / span ${s.length}`,
      '--h': courseHue(s.course_id),
    },
  })),
)
</script>

<template>
  <div class="overflow-x-auto rounded-2xl border border-line bg-paper">
    <div class="grid min-w-[960px]"
      style="grid-template-columns: 76px repeat(4, minmax(0, 1fr)) 40px repeat(4, minmax(0, 1fr)); grid-template-rows: 52px repeat(5, 84px);">

      <!-- หัวตาราง -->
      <div style="grid-row: 1; grid-column: 1"
        class="flex items-center justify-center border-b border-line bg-leaf-50 text-xs font-semibold text-ink-soft">วัน / คาบ</div>
      <div v-for="p in periods" :key="p.n" :style="{ gridRow: 1, gridColumn: colOf(p.n) }"
        class="flex flex-col items-center justify-center border-b border-l border-line bg-leaf-50">
        <span class="text-sm font-semibold text-leaf-900">คาบ {{ p.n }}</span>
        <span class="text-[11px] leading-tight text-ink-soft">{{ p.time }}</span>
      </div>

      <!-- ป้ายวัน -->
      <div v-for="(d, i) in days" :key="d.key" :style="{ gridRow: i + 2, gridColumn: 1 }"
        class="flex items-center justify-center border-b border-line bg-leaf-50 text-sm font-semibold text-leaf-800">
        {{ d.label }}
      </div>

      <!-- ช่องว่าง (เส้นตาราง) -->
      <div v-for="c in cells" :key="c.key" :style="{ gridRow: c.row, gridColumn: c.col }"
        class="border-b border-l border-line"></div>

      <!-- แถบพักกลางวัน -->
      <div style="grid-row: 1 / span 6; grid-column: 6" aria-label="พักกลางวัน"
        class="flex items-center justify-center border-x border-line bg-leaf-50 text-xs font-semibold text-ink-soft">
        <span style="writing-mode: vertical-rl">พักกลางวัน 12.00–13.00</span>
      </div>

      <!-- ครั้งเรียน -->
      <div v-for="b in blocks" :key="b.key" :style="b.style" class="block">
        <p class="font-semibold leading-snug">{{ b.title }}</p>
        <p class="text-[13px] leading-snug opacity-80">{{ b.lines.join(' · ') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block {
  z-index: 1;
  margin: 3px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
  font-size: 15px;
  border-radius: 8px;
  border-left: 5px solid hsl(var(--h) 55% 36%);
  background: hsl(var(--h) 60% 87%);
  color: hsl(var(--h) 70% 14%);
}
</style>