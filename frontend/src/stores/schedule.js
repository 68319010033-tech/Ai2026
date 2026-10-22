import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { days, groups, teachers, rooms, mockSessions, hardConstraints } from '../mock/data'

// true = ใช้ข้อมูลตัวอย่าง; เปลี่ยนเป็น false เมื่อ backend พร้อม แล้วแก้ generate()/load ให้เรียก API
export const USE_MOCK = true

const pools = { group: groups, teacher: teachers, room: rooms }

export const useScheduleStore = defineStore('schedule', () => {
    const imported = ref(false)
    const sessions = ref([])
    const status = ref('idle')
    const message = ref('')
    const progress = ref(0)
    const checks = ref([])

    const view = ref('group')
    const selectedId = ref(groups[0].id)
    const query = ref('')

    function useSampleData() { imported.value = true }

    function generate() {
        status.value = 'running'
        progress.value = 0
        sessions.value = []
        checks.value = []
        message.value = ''
        const timer = setInterval(() => {
            progress.value = Math.min(100, progress.value + 7)
            if (progress.value >= 100) {
                clearInterval(timer)
                sessions.value = mockSessions
                checks.value = hardConstraints.map((label) => ({ label, ok: true }))
                status.value = 'done'
            }
        }, 150)
    }

    // ใช้ทดสอบหน้าตาเท่านั้น ลบเมื่อต่อ backend จริง
    const mockMessages = {
        infeasible: 'ไม่พบคำตอบที่ผ่านเงื่อนไขบังคับทุกข้อภายใต้ข้อมูลปัจจุบัน',
        timeout: 'หมดเวลาคำนวณก่อนพบคำตอบที่ผ่านทุกข้อ',
        error: 'ระบบจัดตารางตอบกลับผิดพลาด',
    }
    function simulateFail(kind) {
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
                periods: sessions.value.filter((s) => s[key.value] === e.id).reduce((a, s) => a + s.length, 0),
            }))
    })

    const selectedSessions = computed(() => sessions.value.filter((s) => s[key.value] === selectedId.value))
    const selectedEntity = computed(() => pools[view.value].find((e) => e.id === selectedId.value))

    const summary = computed(() => {
        const list = selectedSessions.value
        const perDay = Object.fromEntries(days.map((d) => [d.key, 0]))
        list.forEach((s) => (perDay[s.day] += s.length))
        const max = Math.max(0, ...Object.values(perDay))
        const busiest = max ? days.find((d) => perDay[d.key] === max).label : '-'
        return { count: list.length, periods: list.reduce((a, s) => a + s.length, 0), busiest, max }
    })

    return {
        imported, sessions, status, message, progress, checks, view, selectedId, query,
        entities, selectedSessions, selectedEntity, summary,
         useSampleData, generate, simulateFail, setView,
    }
})
