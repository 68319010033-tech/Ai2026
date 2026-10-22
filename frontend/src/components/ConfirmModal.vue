<script setup>
import { ref, watch } from 'vue'

defineProps({
  title: String,
  message: String,
  confirmText: { type: String, default: 'ยืนยัน' },
  cancelText: { type: String, default: 'ยกเลิก' },
})
const open = defineModel({ default: false })
const emit = defineEmits(['confirm'])
const dialog = ref(null)

watch(open, (v) => {
  if (v && !dialog.value.open) dialog.value.showModal()
  if (!v && dialog.value.open) dialog.value.close()
})

// คลิกที่พื้นหลังมืดนอกกล่อง = ปิด
const onBackdrop = (e) => { if (e.target === dialog.value) open.value = false }
const confirm = () => { open.value = false; emit('confirm') }
</script>

<template>
  <dialog ref="dialog" class="modal" @close="open = false" @click="onBackdrop">
    <div class="p-6">
      <h2 class="text-lg font-bold text-leaf-900">{{ title }}</h2>
      <p class="mt-1 text-sm text-ink-soft">{{ message }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-leaf-50"
          @click="open = false">{{ cancelText }}</button>
        <button type="button" class="rounded-xl bg-leaf-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-leaf-700"
          @click="confirm">{{ confirmText }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.modal {
  margin: auto;
  width: min(92vw, 24rem);
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 1rem;
  background: #fff;
  color: var(--color-ink);
}
.modal::backdrop { background: rgba(20, 39, 28, 0.45); }
</style>