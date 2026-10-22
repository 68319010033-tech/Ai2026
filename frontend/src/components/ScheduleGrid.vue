<script setup>
import { computed } from 'vue'
import { days, periods, nameOf, courseHue } from '../mock/data'

const props = defineProps({
    sessions: { type: Array, default: () => [] },
    mode: { type: String, default: 'group' }, // group | teacher | room
})

// แถวที่ 1 = หัวตาราง, คาบ 1–4 = แถว 2–5, พักเที่ยง = แถว 6, คาบ 5–8 = แถว 7–10
const rowOf = (p) => (p <= 4 ? p + 1 : p + 2)

const cells = computed(() =>
    periods.flatMap((p) => days.map((d, i) => ({ key: `${d.key}${p.n}`, row: rowOf(p.n), col: i + 2 }))),
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
            gridRow: `${rowOf(s.start_period)} / span ${s.length}`,
            gridColumn: days.findIndex((d) => d.key === s.day) + 2,
            '--h': courseHue(s.course_id),
        },
        time: `${periods[s.start_period - 1].time.slice(0, 5)}–${periods[s.start_period + s.length - 2].time.slice(6)}`,
    })),
)
</script>

<template>
    <div class="overflow-x-auto rounded-2xl border border-line bg-paper">
        <div class="grid min-w-[780px]"
            style="grid-template-columns: 76px repeat(5, minmax(0, 1fr)); grid-template-rows: 40px repeat(4, 58px) 28px repeat(4, 58px);">
            <div v-for="(d, i) in days" :key="d.key" :style="{ gridRow: 1, gridColumn: i + 2 }"
                class="flex items-center justify-center border-b border-l border-line bg-leaf-50 text-sm font-semibold text-leaf-800">
                {{ d.label }}
            </div>
            <div style="grid-row: 1; grid-column: 1" class="border-b border-line bg-leaf-50"></div>

            <div v-for="p in periods" :key="p.n" :style="{ gridRow: p.n <= 4 ? p.n + 1 : p.n + 2, gridColumn: 1 }"
                class="flex flex-col items-center justify-center border-b border-line text-ink-soft">
                <span class="text-sm font-semibold text-ink">คาบ {{ p.n }}</span>
                <span class="text-[11px] leading-tight">{{ p.time }}</span>
            </div>

            <div v-for="c in cells" :key="c.key" :style="{ gridRow: c.row, gridColumn: c.col }"
                class="border-b border-l border-line"></div>

            <div style="grid-row: 6; grid-column: 1 / -1"
                class="flex items-center justify-center border-b border-line bg-leaf-50/70 text-xs text-ink-soft"
                aria-label="พักกลางวัน">
                พักกลางวัน 12.00–13.00
            </div>

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
    gap: 2px;
    overflow: hidden;
    font-size: 15px;
    border-radius: 8px;
    border-left: 5px solid hsl(var(--h) 55% 36%);
    background: hsl(var(--h) 60% 87%);
    color: hsl(var(--h) 70% 14%)
}
</style>
