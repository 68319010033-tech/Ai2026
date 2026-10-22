<script setup>
import { computed } from 'vue'
import { useScheduleStore, USE_MOCK } from '../stores/schedule'

const store = useScheduleStore()

const failed = computed(() => ['infeasible', 'timeout', 'error'].includes(store.status))

const outcome = {
    infeasible: {
        title: 'ไม่พบคำตอบภายใต้เงื่อนไขปัจจุบัน',
        hints: [
            'ครูมีคาบที่ต้องสอนรวมเกินเพดานต่อวัน/สัปดาห์ (max_periods) หรือไม่',
            'ห้องประเภทที่ต้องใช้ (COMPUTER/NETWORK/MEDIA) มีจำนวนหรือความจุพอหรือไม่',
            'blocked_slots และ fixed_sessions ทับซ้อนกันเองหรือไม่',
            'วิชา 3 คาบต่อเนื่องมีช่วงเวลาว่างพอก่อน/หลังพักเที่ยงหรือไม่',
        ],
    },
    timeout: {
        title: 'หมดเวลาคำนวณ',
        hints: [
            'ยังไม่ทราบว่ามีคำตอบหรือไม่ ไม่ได้แปลว่าเป็นไปไม่ได้',
            'ลองจัดใหม่อีกครั้ง หรือขอให้ผู้ดูแลเพิ่มเวลาคำนวณ',
        ],
    },
    error: {
        title: 'เกิดข้อผิดพลาดในระบบ',
        hints: [
            'ตรวจว่านำเข้าข้อมูลครบทั้ง 10 ไฟล์และไม่มีข้อผิดพลาด',
            'ลองจัดใหม่อีกครั้ง ถ้ายังเป็นซ้ำให้แจ้งผู้ดูแลระบบ',
        ],
    },
}


const stage = computed(() => {
    const p = store.progress
    if (p < 25) return 'กำลังเตรียมข้อมูล'
    if (p < 75) return 'กำลังจัดตาราง'
    return 'กำลังตรวจข้อชน'
})
</script>

<template>
    <h1 class="text-2xl font-bold text-leaf-900">จัดตาราง</h1>
    <p class="mt-1 text-ink-soft">ระบบจะจัดทุกครั้งเรียนให้ผ่านเงื่อนไขบังคับครบก่อน แล้วจึงปรับให้ตารางสมดุลขึ้น</p>

    <section class="mt-6 rounded-2xl border border-line bg-paper p-6">
        <div class="flex flex-wrap items-center gap-4">
            <button
                class="rounded-xl bg-leaf-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:bg-leaf-200"
                :disabled="store.status === 'running'" @click="store.generate()">
                {{ store.status === 'running' ? 'กำลังคำนวณ…' : store.status === 'done' ? 'จัดตารางใหม่' : failed ?
                    'ลองจัดใหม่' : 'เริ่มจัดตาราง' }}
            </button>
            <p v-if="!store.imported" class="text-sm text-ink-soft">ยังไม่ได้นำเข้าข้อมูล (ลองต่อกับข้อมูลตัวอย่างได้)
            </p>
        </div>

        <div v-if="store.status === 'running'" class="mt-6" role="status" aria-live="polite">
            <div class="flex justify-between text-sm"><span>{{ stage }}</span><span>{{ store.progress }}%</span></div>
            <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-leaf-100">
                <div class="h-full rounded-full bg-leaf-500 transition-[width] duration-150"
                    :style="{ width: store.progress + '%' }"></div>
            </div>
        </div>

        <div v-if="store.status === 'done'"
            class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-leaf-50 px-4 py-3">
            <p class="font-semibold text-leaf-800">จัดตารางสำเร็จ {{ store.sessions.length }} ครั้งเรียน</p>
            <RouterLink to="/schedule" class="font-semibold text-leaf-700 underline underline-offset-4">ดูตาราง
            </RouterLink>
        </div>
        <div v-if="failed" role="alert" class="mt-6 rounded-xl border border-warn/30 bg-warn-bg px-4 py-4">
            <p class="font-semibold text-warn">{{ outcome[store.status].title }}</p>
            <p v-if="store.message" class="mt-1 text-sm">{{ store.message }}</p>
            <p class="mt-3 text-sm font-semibold">แนวทางตรวจสอบ</p>
            <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                <li v-for="h in outcome[store.status].hints" :key="h">{{ h }}</li>
            </ul>
            <RouterLink to="/"
                class="mt-3 inline-block text-sm font-semibold text-leaf-700 underline underline-offset-4">
                กลับไปตรวจข้อมูลนำเข้า</RouterLink>
        </div>

        <div v-if="USE_MOCK"
            class="mt-6 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-4 text-sm">
            <span class="text-ink-soft">ทดสอบหน้าตา (ลบตอนต่อ backend):</span>
            <button v-for="k in ['infeasible', 'timeout', 'error']" :key="k" type="button"
                class="rounded-lg border border-line px-3 py-1 hover:bg-leaf-50" @click="store.simulateFail(k)">{{ k
                }}</button>
        </div>
    </section>

    <section v-if="store.checks.length" class="mt-6">
        <h2 class="font-semibold">ผลตรวจเงื่อนไขบังคับ</h2>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2">
            <li v-for="c in store.checks" :key="c.label"
                class="flex items-start gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm">
                <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
                    :class="c.ok ? 'bg-leaf-600' : 'bg-warn'">
                    <svg v-if="c.ok" viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor"
                        stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                    <span v-else class="text-xs font-bold">!</span>
                </span>
                <div>
                    <p>{{ c.label }}</p>
                    <p v-if="c.detail" class="mt-0.5 text-xs text-ink-soft">{{ c.detail }}</p>
                </div>
            </li>
        </ul>
    </section>
</template>
