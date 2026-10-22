import { createRouter, createWebHashHistory } from 'vue-router'
import ImportView from '../views/ImportView.vue'
import GenerateView from '../views/GenerateView.vue'
import ScheduleView from '../views/ScheduleView.vue'
import ExportView from '../views/ExportView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import { useAuthStore } from '../stores/auth'

// ใช้ hash history เพื่อให้ deploy เป็นไฟล์ static ได้โดยไม่ต้องตั้ง fallback
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
        { path: '/register', name: 'register', component: RegisterView, meta: { public: true } },
        { path: '/', name: 'import', component: ImportView },
        { path: '/generate', name: 'generate', component: GenerateView },
        { path: '/schedule', name: 'schedule', component: ScheduleView },
        { path: '/export', name: 'export', component: ExportView },
    ],
})

router.beforeEach((to) => {
    const auth = useAuthStore()
    if (!to.meta.public && !auth.isAuthed) return { name: 'login' }
    if (to.meta.public && auth.isAuthed) return { name: 'import' }
})

export default router