import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import axios from 'axios'
import { USE_MOCK } from './schedule'
import { DEMO_ACCOUNT } from '../config'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const USERS_KEY = 'mock_users' // ใช้เฉพาะโหมด mock

const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function mockUsers() {
    let users = read(USERS_KEY, null)
    if (!users) {
        users = [{ name: 'ผู้ดูแลระบบ', username: 'admin', password: 'admin1234' }] // บัญชีทดสอบ
        if (!users.some((u) => u.username === DEMO_ACCOUNT.username)) {
               users.push({ name: DEMO_ACCOUNT.name, username: DEMO_ACCOUNT.username, password: DEMO_ACCOUNT.password })
                }
         localStorage.setItem(USERS_KEY, JSON.stringify(users))
    }
    return users
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref(localStorage.getItem(TOKEN_KEY) || '')
    const user = ref(read(USER_KEY, null))
    const isAuthed = computed(() => !!token.value)

    const applyHeader = () => {
        if (token.value) axios.defaults.headers.common.Authorization = `Bearer ${token.value}`
        else delete axios.defaults.headers.common.Authorization
    }
    applyHeader()

    function setSession(t, u) {
        token.value = t
        user.value = u
        localStorage.setItem(TOKEN_KEY, t)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
        applyHeader()
    }

    async function login({ username, password }) {
        if (USE_MOCK) {
            const u = mockUsers().find((x) => x.username === username && x.password === password)
            if (!u) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
            return setSession('mock-token', { username: u.username, name: u.name })
        }
        try {
            const { data } = await axios.post('/api/login', { username, password })
            setSession(data.token, data.user)
        } catch (e) {
            throw new Error(e.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง')
        }
    }

    async function register({ name, username, password }) {
        if (USE_MOCK) {
            const users = mockUsers()
            if (users.some((x) => x.username === username)) throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว')
            users.push({ name, username, password })
            localStorage.setItem(USERS_KEY, JSON.stringify(users))
            return
        }
        try {
            await axios.post('/api/register', { name, username, password })
        } catch (e) {
            throw new Error(e.response?.data?.message || 'สมัครสมาชิกไม่สำเร็จ ลองใหม่อีกครั้ง')
        }
    }

    function logout() {
        token.value = ''
        user.value = null
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        applyHeader()
    }

    return { token, user, isAuthed, login, register, logout }
})
