import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import axios from 'axios'
import { days, groups, teachers, rooms, mockSessions, hardConstraints } from '../mock/data'

// false = ต่อ backend จริง; true = ใช้ข้อมูลจำลองในเครื่อง
export const USE_MOCK = false

const pools = { group: groups, teacher: teachers, room: rooms }

export const useScheduleStore = defineStore('schedule', () => {
    const imported = ref(false)
    const sessions = ref([])
    const status = ref('idle')
    const message = ref('')
    const progress = ref(0)
    const checks = ref([])
    const currentJobId = ref('')

    const view = ref('group')
    const selectedId = ref(groups[0].id)
    const query = ref('')

    let pollTimer = null

    async function useSampleData() {
        imported.value = true
        if (!USE_MOCK) {
            try {
                await axios.post('/api/import', { useSample: true, records: [] })
            } catch (e) {
                console.warn('Backend import error:', e.message)
            }
        }
    }

    async function generate() {
        if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
        }

        status.value = 'running'
        progress.value = 5
        sessions.value = []
        checks.value = []
        message.value = 'กำลังส่งคำขอจัดตาราง...'

        if (USE_MOCK) {
            pollTimer = setInterval(() => {
                progress.value = Math.min(100, progress.value + 7)
                if (progress.value >= 100) {
                    clearInterval(pollTimer)
                    pollTimer = null
                    sessions.value = mockSessions
                    checks.value = hardConstraints.map((label) => ({ label, ok: true }))
                    status.value = 'done'
                }
            }, 150)
            return
        }

        try {
            const { data } = await axios.post('/api/generate')
            currentJobId.value = data.jobId

            pollTimer = setInterval(async () => {
                try {
                    const statusRes = await axios.get(`/api/status/${currentJobId.value}`)
                    const job = statusRes.data
                    progress.value = job.progress || 0
                    if (job.message) message.value = job.message

                    if (job.state === 'done') {
                        clearInterval(pollTimer)
                        pollTimer = null
                        const schedRes = await axios.get(`/api/schedule/${currentJobId.value}`)
                        sessions.value = schedRes.data.sessions || []
                        checks.value = schedRes.data.checks || []
                        status.value = 'done'
                    } else if (['failed', 'infeasible', 'timeout', 'error'].includes(job.state)) {
                        clearInterval(pollTimer)
                        pollTimer = null
                        status.value = job.state === 'failed' ? 'error' : job.state
                        message.value = job.message || 'เกิดข้อผิดพลาดในการจัดตาราง'
                    }
                } catch (err) {
                    clearInterval(pollTimer)
                    pollTimer = null
                    status.value = 'error'
                    message.value = err.response?.data?.message || err.message
                }
            }, 300)
        } catch (e) {
            status.value = 'error'
            message.value = e.response?.data?.message || e.message
        }
    }

    // ฟังก์ชันจำลองข้อผิดพลาดสำหรับทดสอบหน้าตา UI
    const mockMessages = {
        infeasible: 'ไม่พบคำตอบที่ผ่านเงื่อนไขบังคับทุกข้อภายใต้ข้อมูลปัจจุบัน',
        timeout: 'หมดเวลาคำนวณก่อนพบคำตอบที่ผ่านทุกข้อ',
        error: 'ระบบจัดตารางตอบกลับผิดพลาด',
    }
    function simulateFail(kind) {
        if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
        }
        sessions.value = []
        checks.value = []
        progress.value = 0
        message.value = mockMessages[kind]
        status.value = kind
    }

    function setView(v) {
        view.value = v
        selectedId.value = pools[v][0].id
        query.value = ''
    }

    const key = computed(() => `${view.value}_id`)

    const entities = computed(() => {
        const q = query.value.trim().toLowerCase()
        return pools[view.value]
            .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
            .map((e) => ({
                ...e,
                periods: sessions.value.filter((s) => s[key.value] === e.id).reduce((a, s) => a + (s.length || 0), 0),
            }))
    })

    const selectedSessions = computed(() => sessions.value.filter((s) => s[key.value] === selectedId.value))
    const selectedEntity = computed(() => pools[view.value].find((e) => e.id === selectedId.value))

    const summary = computed(() => {
        const list = selectedSessions.value
        const perDay = Object.fromEntries(days.map((d) => [d.key, 0]))
        list.forEach((s) => {
            if (perDay[s.day] !== undefined) perDay[s.day] += (s.length || 0)
        })
        const max = Math.max(0, ...Object.values(perDay))
        const busiestDay = days.find((d) => perDay[d.key] === max)
        const busiest = max ? (busiestDay ? busiestDay.label : '-') : '-'
        return { count: list.length, periods: list.reduce((a, s) => a + (s.length || 0), 0), busiest, max }
    })

    return {
        imported, sessions, status, message, progress, checks, currentJobId, view, selectedId, query,
        entities, selectedSessions, selectedEntity, summary,
        useSampleData, generate, simulateFail, setView,
    }
})
