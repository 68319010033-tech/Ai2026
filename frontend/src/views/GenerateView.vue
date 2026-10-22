<script setup>
import { computed } from 'vue'
import { useScheduleStore } from '../stores/schedule'

const store = useScheduleStore()

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
      <button class="rounded-xl bg-leaf-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:bg-leaf-200"
        :disabled="store.status === 'running'" @click="store.generate()">
        {{ store.status === 'done' ? 'จัดตารางใหม่' : store.status === 'running' ? 'กำลังคำนวณ…' : 'เริ่มจัดตาราง' }}
      </button>
      <p v-if="!store.imported" class="text-sm text-ink-soft">ยังไม่ได้นำเข้าข้อมูล (ลองต่อกับข้อมูลตัวอย่างได้)</p>
    </div>

    <div v-if="store.status === 'running'" class="mt-6" role="status" aria-live="polite">
      <div class="flex justify-between text-sm"><span>{{ stage }}</span><span>{{ store.progress }}%</span></div>
      <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-leaf-100">
        <div class="h-full rounded-full bg-leaf-500 transition-[width] duration-150" :style="{ width: store.progress + '%' }"></div>
      </div>
    </div>

    <div v-if="store.status === 'done'" class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-leaf-50 px-4 py-3">
      <p class="font-semibold text-leaf-800">จัดตารางสำเร็จ {{ store.sessions.length }} ครั้งเรียน</p>
      <RouterLink to="/schedule" class="font-semibold text-leaf-700 underline underline-offset-4">ดูตาราง</RouterLink>
    </div>
  </section>

  <section v-if="store.checks.length" class="mt-6">
    <h2 class="font-semibold">ผลตรวจเงื่อนไขบังคับ</h2>
    <ul class="mt-3 grid gap-2 sm:grid-cols-2">
      <li v-for="c in store.checks" :key="c.label"
        class="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm">
        <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" :class="c.ok ? 'bg-leaf-600' : 'bg-warn'">
          <svg v-if="c.ok" viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
          <span v-else class="text-xs font-bold">!</span>
        </span>
        {{ c.label }}
      </li>
    </ul>
  </section>
</template>
