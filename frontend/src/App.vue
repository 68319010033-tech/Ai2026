<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore, USE_MOCK } from './stores/schedule'

const store = useScheduleStore()
const route = useRoute()

const steps = computed(() => [
  { to: '/', name: 'import', label: 'นำเข้าข้อมูล', done: store.imported },
  { to: '/generate', name: 'generate', label: 'จัดตาราง', done: store.status === 'done' },
  { to: '/schedule', name: 'schedule', label: 'ดูตาราง', done: store.status === 'done' },
  { to: '/export', name: 'export', label: 'ส่งออก', done: false },
])
</script>

<template>
  <div class="min-h-full lg:flex">
    <aside class="border-b border-line bg-paper lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div class="flex items-center gap-3 px-5 py-4 lg:py-6">
        <svg viewBox="0 0 32 32" class="h-9 w-9 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#1d7d47" />
          <g fill="#fff">
            <rect x="7" y="7" width="8" height="8" rx="2" />
            <rect x="17" y="7" width="8" height="8" rx="2" opacity=".55" />
            <rect x="7" y="17" width="8" height="8" rx="2" opacity=".55" />
            <rect x="17" y="17" width="8" height="8" rx="2" />
          </g>
        </svg>
        <div class="leading-tight">
          <p class="font-semibold text-leaf-900">Smart Campus</p>
          <p class="text-xs text-ink-soft">ระบบจัดตารางเรียน</p>
        </div>
      </div>

      <nav class="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-4 lg:pb-0" aria-label="ขั้นตอนการทำงาน">
        <RouterLink v-for="(s, i) in steps" :key="s.to" :to="s.to"
          class="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-leaf-50"
          :class="route.name === s.name ? 'bg-leaf-100 font-semibold text-leaf-900' : 'text-ink-soft'">
          <span class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold"
            :class="s.done ? 'bg-leaf-600 text-white' : route.name === s.name ? 'bg-leaf-700 text-white' : 'border border-line text-ink-soft'">
            <svg v-if="s.done" viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
            <template v-else>{{ i + 1 }}</template>
          </span>
          {{ s.label }}
        </RouterLink>
      </nav>

      <p v-if="USE_MOCK" class="mx-5 mb-4 mt-6 hidden rounded-xl bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn lg:block">
        ตอนนี้ใช้ข้อมูลตัวอย่าง ผลลัพธ์ยังไม่ได้มาจาก backend
      </p>
    </aside>

    <main class="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">
      <div class="mx-auto max-w-6xl">
        <RouterView />
      </div>
    </main>
  </div>
</template>
