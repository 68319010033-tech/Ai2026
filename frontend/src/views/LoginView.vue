<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import FormField from '../components/FormField.vue'
import { useAuthStore } from '../stores/auth'
import { DEMO_ACCOUNT } from '../config'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const errors = reactive({ username: '', password: '' })
const formError = ref('')
const loading = ref(false)


function fillDemo() {
    form.username = DEMO_ACCOUNT.username
    form.password = DEMO_ACCOUNT.password
    errors.username = errors.password = formError.value = ''
}

function validate() {
    errors.username = form.username.trim() ? '' : 'กรอกชื่อผู้ใช้'
    errors.password = form.password ? '' : 'กรอกรหัสผ่าน'
    return !errors.username && !errors.password
}

async function submit() {
    formError.value = ''
    if (!validate()) return
    loading.value = true
    try {
        await auth.login({ username: form.username.trim(), password: form.password })
        router.push('/')
    } catch (e) {
        formError.value = e.message
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <AuthShell title="เข้าสู่ระบบ" subtitle="ใช้บัญชีของคุณเพื่อจัดการตารางเรียน">
        <p v-if="route.query.registered" role="status"
            class="mt-4 rounded-xl bg-leaf-50 px-4 py-2 text-sm text-leaf-800">
            สมัครสมาชิกแล้ว เข้าสู่ระบบได้เลย
        </p>

        <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
            <FormField id="username" v-model="form.username" label="ชื่อผู้ใช้" autocomplete="username"
                :error="errors.username" />
            <FormField id="password" v-model="form.password" label="รหัสผ่าน" type="password"
                autocomplete="current-password" :error="errors.password" />

            <p v-if="formError" role="alert" class="rounded-xl 1    bg-warn-bg px-4 py-2 text-sm text-warn">{{ formError
                }}</p>

            <button type="submit" :disabled="loading"
                class="w-full rounded-xl bg-leaf-600 py-3 font-semibold text-white transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:bg-leaf-300">
                {{ loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ' }}
            </button>

            <div v-if="DEMO_ACCOUNT.show" class="mt-5 rounded-xl border border-leaf-200 bg-leaf-50 px-4 py-3 text-sm">
                <p class="font-semibold text-leaf-800">บัญชีทดสอบสำหรับกรรมการ</p>
                <p class="mt-1 text-ink-soft">ชื่อผู้ใช้: <span class="font-semibold text-ink">{{ DEMO_ACCOUNT.username
                        }}</span></p>
                <p class="text-ink-soft">รหัสผ่าน: <span class="font-semibold text-ink">{{ DEMO_ACCOUNT.password
                        }}</span></p>
                <button type="button"
                    class="mt-2 font-semibold text-leaf-700 underline underline-offset-4 hover:text-leaf-900"
                    @click="fillDemo">กรอกให้อัตโนมัติ</button>
            </div>

        </form>

        <template #footer>
            ยังไม่มีบัญชี?
            <RouterLink to="/register" class="font-semibold text-leaf-700 underline underline-offset-4">สมัครสมาชิก
            </RouterLink>
        </template>
    </AuthShell>
</template>
