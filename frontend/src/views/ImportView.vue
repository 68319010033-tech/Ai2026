<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useScheduleStore } from '../stores/schedule'

const store = useScheduleStore()
const router = useRouter()

const required = [
    ['groups.csv', 'กลุ่มเรียน'], ['teachers.csv', 'ครู'], ['rooms.csv', 'ห้อง'],
    ['courses.csv', 'รายวิชา'], ['offerings.csv', 'รายการสอน'], ['timeslots.csv', 'ช่วงเวลา'],
    ['blocked_slots.csv', 'เวลาที่ถูกบล็อก'], ['fixed_sessions.csv', 'ครั้งเรียนที่ล็อกไว้'],
    ['students.csv', 'นักศึกษา'], ['enrollments.csv', 'การลงทะเบียน'],
]

const files = ref({}) // ชื่อไฟล์ -> { rows, header, preview }
const active = ref('')
const dragging = ref(false)
const skipped = ref([])
const errors = ref([]) // [{ file, row, message }] ตรงกับ contract /api/import

// คอลัมน์ขั้นต่ำที่ต้องมี (ตรวจเฉพาะไฟล์ที่เราแน่ใจจากโจทย์: solution schema, offerings ฯลฯ)
// ถ้าไม่แน่ใจชื่อคอลัมน์จริงในไฟล์ ให้เทียบกับ header ไฟล์จริงก่อนใช้
const requiredCols = {
    'fixed_sessions.csv': ['offering_id'],
}

const missing = computed(() => required.filter(([f]) => !files.value[f]))
const ready = computed(() => missing.value.length === 0)
const previewing = computed(() => files.value[active.value])

function parseCsv(text) {
    const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim())
    const rows = lines.map((l) => l.split(',').map((c) => c.trim()))
    const header = rows[0] ?? []
    const badRows = []
    rows.slice(1).forEach((r, i) => {
        if (r.length !== header.length) badRows.push(i + 2) // +2 = นับ header และเริ่มที่ 1
    })
    return { header, rows: Math.max(0, rows.length - 1), preview: rows.slice(1, 7), badRows }
}


async function readFiles(list) {
    const next = { ...files.value }
    skipped.value = []
    for (const f of list) {
        if (!f.name.toLowerCase().endsWith('.csv')) { skipped.value.push(f.name); continue }
        next[f.name] = parseCsv(await f.text())
        active.value = f.name
    }
    files.value = next
    errors.value = Object.entries(next).flatMap(([file, f]) => {
        const list = []
        if (!f.rows) list.push({ file, row: '-', message: 'ไฟล์ไม่มีข้อมูล' })
        f.badRows.slice(0, 5).forEach((row) =>
            list.push({ file, row, message: 'จำนวนคอลัมน์ไม่ตรงกับหัวตาราง' }))
        if (f.badRows.length > 5) list.push({ file, row: '-', message: `และอีก ${f.badRows.length - 5} แถวที่มีปัญหาเดียวกัน` })
            ; (requiredCols[file] ?? []).filter((c) => !f.header.includes(c))
                .forEach((c) => list.push({ file, row: 'หัวตาราง', message: `ไม่พบคอลัมน์ ${c}` }))
        return list
    })

    if (ready.value && !errors.value.length) store.imported = true
}

const onDrop = (e) => { dragging.value = false; readFiles([...e.dataTransfer.files]) }
const onPick = (e) => readFiles([...e.target.files])

function useSample() {
    store.useSampleData()
    router.push('/generate')
}
</script>

<template>
    <h1 class="text-2xl font-bold text-leaf-900">นำเข้าข้อมูล</h1>
    <p class="mt-1 text-ink-soft">เลือกไฟล์ CSV ทั้ง 10 ไฟล์ของโจทย์ ระบบจะตรวจว่าครบและแสดงตัวอย่างข้อมูลให้ดู</p>

    <label
        class="mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors"
        :class="dragging ? 'border-leaf-500 bg-leaf-50' : 'border-leaf-200 bg-paper hover:border-leaf-400'"
        @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
        <svg viewBox="0 0 24 24" class="h-8 w-8 text-leaf-600" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
        </svg>
        <span class="font-semibold">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</span>
       <span class="text-sm text-ink-soft">เลือกไฟล์ .csv ได้หลายไฟล์พร้อมกัน (เปิดเข้าไปในโฟลเดอร์ก่อน แล้วเลือกไฟล์ข้างใน)</span>
        <input type="file" multiple accept=".csv" class="sr-only" @change="onPick" />
    </label>

    <p v-if="skipped.length" class="mt-3 rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn">
        ข้ามไฟล์ที่ไม่ใช่ .csv: {{ skipped.join(', ') }}
    </p>

    <section v-if="errors.length" role="alert" class="mt-3 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3">
        <p class="font-semibold text-warn">พบข้อผิดพลาดในข้อมูล {{ errors.length }} รายการ</p>
        <div class="mt-2 overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="text-ink-soft">
                        <th class="pr-4 font-medium">ไฟล์</th>
                        <th class="pr-4 font-medium">แถว</th>
                        <th class="font-medium">ปัญหา</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(e, i) in errors" :key="i">
                        <td class="whitespace-nowrap pr-4 py-1">{{ e.file }}</td>
                        <td class="pr-4 py-1">{{ e.row }}</td>
                        <td class="py-1">{{ e.message }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>


    <div class="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            <li v-for="[file, label] in required" :key="file">
                <button
                    class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-leaf-50 disabled:cursor-default disabled:hover:bg-transparent"
                    :class="active === file ? 'bg-leaf-50' : ''" :disabled="!files[file]" @click="active = file">
                    <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                        :class="files[file] ? 'bg-leaf-600 text-white' : 'border border-line'">
                        <svg v-if="files[file]" viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor"
                            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3.5 8.5l3 3 6-7" />
                        </svg>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">{{ file }}</span>
                        <span class="text-xs text-ink-soft">{{ label }}</span>
                    </span>
                    <span class="text-xs" :class="files[file] ? 'text-leaf-700' : 'text-ink-soft'">
                        {{ files[file] ? `${files[file].rows.toLocaleString()} แถว` : 'ยังไม่มีไฟล์' }}
                    </span>
                </button>
            </li>
        </ul>

        <section class="min-w-0 rounded-2xl border border-line bg-paper p-4">
            <template v-if="previewing">
                <h2 class="font-semibold">ตัวอย่าง {{ active }}</h2>
                <div class="mt-3 overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead>
                            <tr class="border-b border-line text-ink-soft">
                                <th v-for="h in previewing.header" :key="h"
                                    class="whitespace-nowrap px-3 py-2 font-medium">{{ h }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(r, i) in previewing.preview" :key="i"
                                class="border-b border-line/60 last:border-0">
                                <td v-for="(c, j) in r" :key="j" class="whitespace-nowrap px-3 py-2">{{ c }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="mt-3 text-xs text-ink-soft">แสดง {{ previewing.preview.length }} แถวแรกจากทั้งหมด {{
                    previewing.rows.toLocaleString() }} แถว</p>
            </template>
            <div v-else class="grid h-full min-h-40 place-items-center text-center text-sm text-ink-soft">
                เลือกไฟล์ทางซ้ายเพื่อดูตัวอย่างข้อมูล
            </div>
        </section>
    </div>

    <div class="mt-8 flex flex-wrap items-center gap-3">
        <button
            class="rounded-xl bg-leaf-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:bg-leaf-200"
            :disabled="!ready || errors.length > 0" @click="router.push('/generate')">ไปจัดตาราง</button>
        <button
            class="rounded-xl border border-leaf-300 px-5 py-2.5 font-semibold text-leaf-800 transition-colors hover:bg-leaf-50"
            @click="useSample">ใช้ข้อมูลตัวอย่าง</button>
        <p v-if="!ready" class="text-sm text-ink-soft">ยังขาด {{ missing.length }} ไฟล์</p>
        <p v-else-if="errors.length" class="text-sm text-warn">แก้ข้อผิดพลาดของข้อมูลก่อนจึงจะไปต่อได้</p>
    </div>
</template>
