<script setup>
defineProps({ title: String, subtitle: String })

// บล็อกตัวอย่างในภาพประกอบ: คอลัมน์, แถวเริ่ม, จำนวนแถว, เฉดสี
const blocks = [
  { c: 1, r: 1, s: 2, h: 96 }, { c: 2, r: 1, s: 3, h: 130 }, { c: 4, r: 1, s: 1, h: 80 },
  { c: 3, r: 2, s: 2, h: 160 }, { c: 4, r: 3, s: 2, h: 112 }, { c: 5, r: 3, s: 2, h: 100 },
  { c: 1, r: 4, s: 2, h: 144 }, { c: 2, r: 5, s: 2, h: 90 }, { c: 3, r: 5, s: 2, h: 120 },
]
</script>

<template>
  <div class="min-h-full lg:grid lg:grid-cols-[1fr_minmax(440px,580px)]">
    <aside class="hidden bg-leaf-800 p-12 text-white lg:flex lg:flex-col">
      <div class="flex items-center gap-3">
        <svg viewBox="0 0 32 32" class="h-10 w-10 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#fff" />
          <g fill="#1d7d47">
            <rect x="7" y="7" width="8" height="8" rx="2" />
            <rect x="17" y="7" width="8" height="8" rx="2" opacity=".55" />
            <rect x="7" y="17" width="8" height="8" rx="2" opacity=".55" />
            <rect x="17" y="17" width="8" height="8" rx="2" />
          </g>
        </svg>
        <p class="font-semibold">Smart Campus</p>
      </div>

      <div class="my-auto max-w-lg py-10">
        <h2 class="text-3xl font-bold leading-snug">จัดตารางเรียน ครู และห้อง<br />ให้ลงตัวโดยไม่ชนกัน</h2>
        <p class="mt-3 text-leaf-200">นำเข้าข้อมูล ให้ระบบจัดตาราง แล้วดูและส่งออกผลได้ในที่เดียว</p>

        <div class="mt-10 grid h-72 gap-2" aria-hidden="true"
          style="grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(6, 1fr)">
          <div v-for="n in 30" :key="n" class="rounded-lg bg-white/[0.07]"></div>
          <div v-for="b in blocks" :key="`${b.c}-${b.r}`" class="rounded-lg"
            :style="{ gridColumn: b.c, gridRow: `${b.r} / span ${b.s}`, background: `hsl(${b.h} 50% 82%)` }"></div>
        </div>
      </div>
    </aside>

    <main class="grid place-items-center px-6 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <svg viewBox="0 0 32 32" class="h-10 w-10 shrink-0" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#1d7d47" />
            <g fill="#fff">
              <rect x="7" y="7" width="8" height="8" rx="2" />
              <rect x="17" y="7" width="8" height="8" rx="2" opacity=".55" />
              <rect x="7" y="17" width="8" height="8" rx="2" opacity=".55" />
              <rect x="17" y="17" width="8" height="8" rx="2" />
            </g>
          </svg>
          <p class="font-semibold text-leaf-900">Smart Campus</p>
        </div>

        <h1 class="text-3xl font-bold text-leaf-900">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-ink-soft">{{ subtitle }}</p>
        <slot />
        <p class="mt-6 text-sm text-ink-soft"><slot name="footer" /></p>
      </div>
    </main>
  </div>
</template>