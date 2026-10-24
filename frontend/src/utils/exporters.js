// frontend/src/utils/exporters.js  (ไฟล์ใหม่)
// ส่งออกตารางเป็น PNG / PDF / Excel  (jspdf และ xlsx โหลดตอนกดปุ่มเท่านั้น ไม่ทำให้หน้าเว็บโหลดช้าลง)
import { toPng, getFontEmbedCSS } from 'html-to-image'
import { days, periods, nameOf } from '../mock/data'

// ถ่ายภาพ element ของตารางทีละอัน คืน [{ url, w, h }]
export async function captureCards(els) {
  if (!els.length || els.some((el) => !el)) throw new Error('ไม่พบตารางที่จะส่งออก')
  const base = { pixelRatio: 2, cacheBust: true, backgroundColor: '#cfe3f7' }

  // ฝังฟอนต์ครั้งเดียวแล้วใช้ซ้ำทุกรูป (เร็วกว่าฝังใหม่ทุกครั้ง) ถ้าฝังไม่ได้ให้ข้ามฟอนต์
  let opts = base
  try {
    opts = { ...base, fontEmbedCSS: await getFontEmbedCSS(els[0]) }
  } catch {
    opts = { ...base, skipFonts: true }
  }

  const shots = []
  for (const el of els) {
    let url
    try {
      url = await toPng(el, opts)
    } catch {
      url = await toPng(el, { ...base, skipFonts: true })
    }
    shots.push({ url, w: el.offsetWidth, h: el.offsetHeight })
  }
  return shots
}

export function savePng(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// PDF แนวนอน A4 หน้าละ 1 ตาราง (ใส่เป็นรูปภาพ จึงแสดงภาษาไทยถูกต้องโดยไม่ต้องฝังฟอนต์ใน PDF)
export async function savePdf(shots, filename) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const margin = 8
  shots.forEach((s, i) => {
    if (i) doc.addPage()
    const k = Math.min((pw - margin * 2) / s.w, (ph - margin * 2) / s.h)
    const w = s.w * k
    const h = s.h * k
    doc.addImage(s.url, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'FAST')
  })
  doc.save(filename)
}

// ---------- Excel ----------
function sheetName(name, used) {
  const base = String(name).replace(/[\\/?*[\]:]/g, '-').slice(0, 28) || 'sheet'
  let n = base
  let k = 2
  while (used.has(n.toLowerCase())) n = `${base}-${k++}`
  used.add(n.toLowerCase())
  return n
}

// ตารางรายกลุ่ม: แถว = วัน, คอลัมน์ = คาบ (A วัน, B–E คาบ 1–4, F พักกลางวัน, G–J คาบ 5–8)
function groupSheet(XLSX, list) {
  const aoa = [
    ['วัน', ...periods.slice(0, 4).map((p) => p.time), 'พัก', ...periods.slice(4).map((p) => p.time)],
    ...days.map((d) => [d.label, ...Array(9).fill('')]),
  ]
  aoa[1][5] = 'พักกลางวัน'
  const merges = [{ s: { r: 1, c: 5 }, e: { r: 5, c: 5 } }]

  for (const s of list) {
    const r = days.findIndex((d) => d.key === s.day) + 1
    if (r < 1) continue
    const c = s.start_period <= 4 ? s.start_period : s.start_period + 1
    aoa[r][c] = `${nameOf('course', s.course_id)} (${nameOf('teacher', s.teacher_id)} · ${nameOf('room', s.room_id)})`
    if (s.length > 1) merges.push({ s: { r, c }, e: { r, c: c + s.length - 1 } })
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = [{ wch: 10 }, ...Array(4).fill({ wch: 24 }), { wch: 8 }, ...Array(4).fill({ wch: 24 })]
  return ws
}

export async function saveWorkbook(sessions, filename = 'timetable.xlsx') {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const used = new Set()

  const head = ['วิชา', 'กลุ่ม', 'ครู', 'ห้อง', 'วัน', 'คาบเริ่ม', 'จำนวนคาบ']
  const rows = sessions.map((s) => [
    nameOf('course', s.course_id), nameOf('group', s.group_id), nameOf('teacher', s.teacher_id),
    nameOf('room', s.room_id), s.day, s.start_period, s.length,
  ])
  const all = XLSX.utils.aoa_to_sheet([head, ...rows])
  all['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, all, sheetName('ตารางทั้งหมด', used))

  const groupIds = [...new Set(sessions.map((s) => s.group_id))].sort()
  for (const id of groupIds) {
    const list = sessions.filter((s) => s.group_id === id)
    XLSX.utils.book_append_sheet(wb, groupSheet(XLSX, list), sheetName(nameOf('group', id), used))
  }

  XLSX.writeFile(wb, filename)
}