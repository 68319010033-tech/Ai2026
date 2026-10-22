import { createRouter, createWebHashHistory } from 'vue-router'
import ImportView from '../views/ImportView.vue'
import GenerateView from '../views/GenerateView.vue'
import ScheduleView from '../views/ScheduleView.vue'
import ExportView from '../views/ExportView.vue'

// ใช้ hash history เพื่อให้ deploy เป็นไฟล์ static ได้โดยไม่ต้องตั้ง fallback
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'import', component: ImportView },
    { path: '/generate', name: 'generate', component: GenerateView },
    { path: '/schedule', name: 'schedule', component: ScheduleView },
    { path: '/export', name: 'export', component: ExportView },
  ],
})
