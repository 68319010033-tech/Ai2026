<script setup>
import { useScheduleStore } from '../stores/schedule'
import ScheduleTable from '../components/ScheduleGrid.vue'

const store = useScheduleStore()
const tabs = [
  { key: 'group', label: 'รายกลุ่ม' },
  { key: 'teacher', label: 'รายครู' },
  { key: 'room', label: 'รายห้อง' },
]
</script>

<template>
  <h1 class="text-2xl font-bold text-leaf-900">ดูตาราง</h1>

  <div v-if="!store.sessions.length" class="mt-6 rounded-2xl border border-dashed border-leaf-200 bg-paper px-6 py-14 text-center">
    <p class="font-semibold">ยังไม่มีตารางให้แสดง</p>
    <p class="mt-1 text-sm text-ink-soft">จัดตารางก่อน แล้วกลับมาดูรายกลุ่ม รายครู หรือรายห้องที่นี่</p>
    <RouterLink to="/generate" class="mt-5 inline-block rounded-xl bg-leaf-600 px-5 py-2.5 font-semibold text-white hover:bg-leaf-700">ไปจัดตาราง</RouterLink>
  </div>

  <template v-else>
    <div class="mt-4 inline-flex rounded-xl bg-leaf-100 p-1" role="tablist">
      <button v-for="t in tabs" :key="t.key" role="tab" :aria-selected="store.view === t.key"
        class="rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors"
        :class="store.view === t.key ? 'bg-paper text-leaf-800 shadow-sm' : 'text-leaf-700 hover:text-leaf-900'"
        @click="store.setView(t.key)">{{ t.label }}</button>
    </div>

    <div class="mt-5 grid gap-6 lg:grid-cols-[220px_1fr]">
      <div>
        <input v-model="store.query" type="search" placeholder="ค้นหา" aria-label="ค้นหา"
          class="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-soft/70" />
        <ul class="mt-2 max-h-52 space-y-1 overflow-y-auto lg:max-h-[32rem]">
          <li v-for="e in store.entities" :key="e.id">
            <button class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-leaf-50"
              :class="store.selectedId === e.id ? 'bg-leaf-100 font-semibold text-leaf-900' : ''" @click="store.selectedId = e.id">
              <span class="truncate">{{ e.name }}</span>
              <span class="ml-2 shrink-0 text-xs text-ink-soft">{{ e.periods }} คาบ</span>
            </button>
          </li>
          <li v-if="!store.entities.length" class="px-3 py-2 text-sm text-ink-soft">ไม่พบรายการ</li>
        </ul>
      </div>

      <section class="min-w-0">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-semibold">{{ store.selectedEntity?.name }}</h2>
          <p class="text-sm text-ink-soft">
            {{ store.summary.count }} ครั้งเรียน · {{ store.summary.periods }} คาบ
            <template v-if="store.summary.max"> · วัน{{ store.summary.busiest }}เรียนมากสุด {{ store.summary.max }} คาบ</template>
          </p>
        </div>
        <ScheduleTable :sessions="store.selectedSessions" :mode="store.view" />
        <p v-if="!store.selectedSessions.length" class="mt-3 text-sm text-ink-soft">รายการนี้ยังไม่มีคาบเรียนในตัวอย่างข้อมูล</p>
      </section>
    </div>
  </template>
</template>