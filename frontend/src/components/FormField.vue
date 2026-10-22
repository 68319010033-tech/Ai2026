<script setup>
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  autocomplete: { type: String, default: 'off' },
  error: { type: String, default: '' },
})
const model = defineModel()
</script>

<template>
  <div>
    <label :for="id" class="text-sm font-semibold">{{ label }}</label>
    <input :id="id" v-model="model" :type="type" :autocomplete="autocomplete"
      :aria-invalid="!!error" :aria-describedby="error ? `${id}-error` : undefined"
      class="mt-1 w-full rounded-xl border bg-paper px-3 py-2.5 transition-colors focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
      :class="error ? 'border-warn' : 'border-line'" />
    <p v-if="error" :id="`${id}-error`" class="mt-1 text-sm text-warn">{{ error }}</p>
  </div>
</template>
