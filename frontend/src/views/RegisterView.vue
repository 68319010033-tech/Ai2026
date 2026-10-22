<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import FormField from '../components/FormField.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const form = reactive({ name: '', username: '', password: '', confirm: '' })
const errors = reactive({ name: '', username: '', password: '', confirm: '' })
const formError = ref('')
const loading = ref(false)

function validate() {
  errors.name = form.name.trim() ? '' : 'กรอกชื่อ-นามสกุล'
  errors.username = /^[A-Za-z0-9_.-]{3,}$/.test(form.username) ? '' : 'ชื่อผู้ใช้ยาวอย่างน้อย 3 ตัว ใช้ได้เฉพาะ a-z, 0-9, _ . -'
  errors.password = form.password.length >= 6 ? '' : 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว'
  errors.confirm = form.confirm === form.password ? '' : 'รหัสผ่านไม่ตรงกัน'
  return !Object.values(errors).some(Boolean)
}

async function submit() {
  formError.value = ''
  if (!validate()) return
  loading.value = true
  try {
    await auth.register({ name: form.name.trim(), username: form.username, password: form.password })
    router.push({ name: 'login', query: { registered: '1' } })
  } catch (e) {
    formError.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="สมัครสมาชิก" subtitle="สร้างบัญชีเพื่อเริ่มจัดตารางเรียน">
    <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
      <FormField id="name" v-model="form.name" label="ชื่อ-นามสกุล" autocomplete="name" :error="errors.name" />
      <FormField id="username" v-model="form.username" label="ชื่อผู้ใช้" autocomplete="username" :error="errors.username" />
      <FormField id="password" v-model="form.password" label="รหัสผ่าน" type="password" autocomplete="new-password" :error="errors.password" />
      <FormField id="confirm" v-model="form.confirm" label="ยืนยันรหัสผ่าน" type="password" autocomplete="new-password" :error="errors.confirm" />

      <p v-if="formError" role="alert" class="rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn">{{ formError }}</p>

      <button type="submit" :disabled="loading"
        class="w-full rounded-xl bg-leaf-600 py-3 font-semibold text-white transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:bg-leaf-300">
        {{ loading ? 'กำลังสมัคร…' : 'สมัครสมาชิก' }}
      </button>
    </form>

    <template #footer>
      มีบัญชีแล้ว?
      <RouterLink to="/login" class="font-semibold text-leaf-700 underline underline-offset-4">เข้าสู่ระบบ</RouterLink>
    </template>
  </AuthShell>
</template>
