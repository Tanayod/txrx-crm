'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconAlertTriangle, IconClock, IconPhone, IconCheck, IconDownload, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

const DUE_TYPE_LABELS: any = {
  standard_3: 'มาตรฐาน (3 วัน)',
  vip_30: 'VIP (30 วัน)',
  fifth_next_month: 'วันที่ 5 เดือนถัดไป',
}

const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

// แปลง Date เป็น "YYYY-MM-DD" ตาม local timezone ตรงๆ (ไม่ผ่าน UTC)
// สำคัญ: ห้ามใช้ .toISOString().slice(0,10) เพราะประเทศไทย (UTC+7) จะเลื่อนวันผิดไป 1 วันได้
// (เจอบั๊กนี้มาแล้วในหน้า Dashboard เลยแก้ป้องกันไว้ตั้งแต่แรกในหน้านี้ด้วย)
const localDateStr = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// คำนวณวันครบกำหนดชำระตาม due_type ของลูกค้า
function getDueDate(bookingDate: string, dueType: string) {
  const d = new Date(bookingDate)
  if (dueType === 'vip_30') {
    d.setDate(d.getDate() + 30)
    return d
  }
  if (dueType === 'fifth_next_month') {
    return new Date(d.getFullYear(), d.getMonth() + 1, 5)
  }
  d.setDate(d.getDate() + 3)
  return d
}

// กำหนดส่งใบแพทย์ให้ลูกค้า = วันจอง + 3 วันเสมอ
function getCertDueDate(bookingDate: string) {
  const d = new Date(bookingDate)
  d.setDate(d.getDate() + 3)
  return d
}

export default function Notifications() {
  const { user, role, ready, logout } = useAuth('/notifications')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [debtCases, setDebtCases] = useState<any[]>([])
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false)

  // ===== แจ้งเตือนส่งใบแพทย์ให้ลูกค้า (แบบปฏิทิน) =====
  const [certCases, setCertCases] = useState<any[]>([])
  const [certLoading, setCertLoading] = useState(true)
  const [certStatus, setCertStatus] = useState<'ทั้งหมด' | 'ยังไม่ส่ง' | 'ส่งแล้ว'>('ยังไม่ส่ง')
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth()) // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(localDateStr(now))

  if (ready && !loaded) { fetchDebtCases(); fetchCertCases(); setLoaded(true) }

  async function fetchDebtCases() {
    setLoading(true)
    const today = new Date(); today.setHours(0,0,0,0)

    let allBookings: any[] = []
    let from = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('case_number, booking_date, customers(id, customer_name, phone, type, due_type), payments(amount_received, total_amount, payment_status)')
        .range(from, from + 999)
      if (!chunk || chunk.length === 0) break
      allBookings = [...allBookings, ...chunk]
      if (chunk.length < 1000) break
      from += 1000
    }

    const cases = allBookings
      .map((b: any) => {
        const p = Array.isArray(b.payments) ? b.payments?.[0] : b.payments
        const cust = b.customers
        const status = p?.payment_status
        const isUnpaidStatus = status === 'ยังไม่ชำระ' || status === 'ค้างชำระ' || status === 'เครดิต'
        const outstanding = isUnpaidStatus ? Math.max((p?.total_amount || 0) - (p?.amount_received || 0), 0) : 0
        if (outstanding <= 0 || !cust) return null
        const dueType = cust.due_type || 'standard_3'
        const dueDate = getDueDate(b.booking_date, dueType)
        const daysOver = Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
        return {
          case_number: b.case_number,
          booking_date: b.booking_date,
          customer_id: cust.id,
          customer_name: cust.customer_name,
          phone: cust.phone,
          customer_type: cust.type,
          due_type: dueType,
          due_date: localDateStr(dueDate),
          outstanding,
          daysOver,
          isOverdue: daysOver > 0,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.daysOver - a.daysOver)

    setDebtCases(cases as any[])
    setLoading(false)
  }

  // ดึงรายการจองทั้งหมดที่มีการบันทึกตรวจจริงแล้ว เพื่อคำนวณกำหนดส่งใบแพทย์ให้ลูกค้า
  async function fetchCertCases() {
    setCertLoading(true)
    const today = new Date(); today.setHours(0,0,0,0)

    let all: any[] = []
    let from = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('case_number, booking_date, customers(customer_name, phone), medical_cases(id, actual_count, cert_delivered_to_customer, cert_delivered_at)')
        .range(from, from + 999)
      if (!chunk || chunk.length === 0) break
      all = [...all, ...chunk]
      if (chunk.length < 1000) break
      from += 1000
    }

    const cases = all
      .map((b: any) => {
        const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
        if (!mc?.id) return null
        const dueDate = getCertDueDate(b.booking_date)
        const dueDateStr = localDateStr(dueDate)
        const daysOver = Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
        const delivered = !!mc.cert_delivered_to_customer
        let urgency: 'เกินกำหนดแล้ว' | 'ใกล้ครบกำหนด' | 'ยังไม่ถึงกำหนด'
        if (daysOver > 0) urgency = 'เกินกำหนดแล้ว'
        else if (daysOver >= -1) urgency = 'ใกล้ครบกำหนด'
        else urgency = 'ยังไม่ถึงกำหนด'
        return {
          mc_id: mc.id,
          case_number: b.case_number,
          booking_date: b.booking_date,
          customer_name: (b.customers as any)?.customer_name || '-',
          phone: (b.customers as any)?.phone,
          due_date: dueDateStr,
          daysOver,
          urgency,
          delivered,
          delivered_at: mc.cert_delivered_at,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.daysOver - a.daysOver))

    setCertCases(cases as any[])
    setCertLoading(false)
  }

  const handleMarkDelivered = async (mcId: string) => {
    await supabase.from('medical_cases').update({
      cert_delivered_to_customer: true,
      cert_delivered_at: localDateStr(new Date()),
    }).eq('id', mcId)
    fetchCertCases()
  }

  const handleUndoDelivered = async (mcId: string) => {
    await supabase.from('medical_cases').update({
      cert_delivered_to_customer: false,
      cert_delivered_at: null,
    }).eq('id', mcId)
    fetchCertCases()
  }

  // กรองตามสถานะที่เลือก (ใช้ทั้งกับจุดในปฏิทินและลิสต์รายวัน)
  const statusFilteredCerts = certCases.filter(c => {
    if (certStatus === 'ยังไม่ส่ง') return !c.delivered
    if (certStatus === 'ส่งแล้ว') return c.delivered
    return true
  })

  const certPendingCount = certCases.filter(c => !c.delivered).length
  const certOverdueCount = certCases.filter(c => !c.delivered && c.urgency === 'เกินกำหนดแล้ว').length
  const certSoonCount = certCases.filter(c => !c.delivered && c.urgency === 'ใกล้ครบกำหนด').length

  const exportCertExcel = () => {
    const rows = statusFilteredCerts.map(c => ({
      'เลขจอง': c.case_number, 'ลูกค้า': c.customer_name, 'เบอร์โทร': c.phone || '',
      'วันที่จอง': c.booking_date, 'ครบกำหนดส่ง': c.due_date,
      'สถานะ': c.delivered ? 'ส่งแล้ว' : 'ยังไม่ส่ง', 'ความเร่งด่วน': c.urgency, 'วันที่ส่ง': c.delivered_at || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ส่งใบแพทย์')
    XLSX.writeFile(wb, `แจ้งเตือนส่งใบแพทย์_${localDateStr(new Date())}.xlsx`)
  }

  // ===== สร้างโครงปฏิทินของเดือนที่เลือก =====
  const firstOfMonth = new Date(calYear, calMonth, 1)
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const startWeekday = firstOfMonth.getDay() // 0=อา
  const calCells: (string | null)[] = []
  for (let i = 0; i < startWeekday; i++) calCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calCells.push(localDateStr(new Date(calYear, calMonth, d)))

  const casesByDate: Record<string, any[]> = {}
  statusFilteredCerts.forEach(c => {
    if (!casesByDate[c.due_date]) casesByDate[c.due_date] = []
    casesByDate[c.due_date].push(c)
  })

  const todayStr = localDateStr(new Date())

  const dayColor = (dateStr: string) => {
    const dayCases = casesByDate[dateStr] || []
    if (dayCases.length === 0) return null
    const hasPendingOverdue = dayCases.some(c => !c.delivered && c.urgency === 'เกินกำหนดแล้ว')
    const hasPendingSoon = dayCases.some(c => !c.delivered && c.urgency === 'ใกล้ครบกำหนด')
    const allDelivered = dayCases.every(c => c.delivered)
    if (hasPendingOverdue) return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' }
    if (hasPendingSoon) return { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' }
    if (allDelivered) return { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-400' }
    return { bg: 'bg-sky-50', text: 'text-sky-600', dot: 'bg-sky-400' }
  }

  const goPrevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) } else setCalMonth(calMonth - 1)
  }
  const goNextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) } else setCalMonth(calMonth + 1)
  }
  const goToday = () => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); setSelectedDate(todayStr) }

  const selectedDayCases = selectedDate ? (casesByDate[selectedDate] || []) : []

  const urgencyBadge = (c: any) => {
    if (c.delivered) return <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium"><IconCheck size={10}/> ส่งแล้ว</span>
    if (c.urgency === 'เกินกำหนดแล้ว') return <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium"><IconAlertTriangle size={10}/> เกิน {c.daysOver} วัน</span>
    if (c.urgency === 'ใกล้ครบกำหนด') return <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium"><IconClock size={10}/> ใกล้ครบกำหนด</span>
    return <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full w-fit font-medium">ยังไม่ถึงกำหนด</span>
  }

  // ===== ส่วนลูกหนี้ค้างชำระ (เดิม ไม่แตะ) =====
  const filtered = filterOverdueOnly ? debtCases.filter(c => c.isOverdue) : debtCases
  const totalOutstanding = filtered.reduce((s, c) => s + c.outstanding, 0)
  const overdueCount = debtCases.filter(c => c.isOverdue).length

  const byCustomer: any = {}
  filtered.forEach(c => {
    if (!byCustomer[c.customer_name]) byCustomer[c.customer_name] = { name: c.customer_name, phone: c.phone, type: c.customer_type, total: 0, maxDaysOver: 0, cases: [] }
    byCustomer[c.customer_name].total += c.outstanding
    byCustomer[c.customer_name].maxDaysOver = Math.max(byCustomer[c.customer_name].maxDaysOver, c.daysOver)
    byCustomer[c.customer_name].cases.push(c)
  })
  const customerList = Object.values(byCustomer).sort((a: any, b: any) => b.maxDaysOver - a.maxDaysOver)

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/notifications" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <p className="text-base font-medium text-gray-800">แจ้งเตือน</p>
          <p className="text-xs text-gray-400 mt-0.5">ติดตามการส่งใบแพทย์ให้ลูกค้า และลูกหนี้ค้างชำระ</p>
        </div>

        {/* ===================== ส่วนที่ 1: ปฏิทินแจ้งเตือนส่งใบแพทย์ให้ลูกค้า ===================== */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">📄 แจ้งเตือนส่งใบแพทย์ให้ลูกค้า</p>
          <button onClick={exportCertExcel} className="border border-gray-200 bg-white text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 flex items-center gap-1.5">
            <IconDownload size={13}/> Export
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border-l-4 border-l-amber-400 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ยังไม่ส่งให้ลูกค้า</p>
            <p className="text-3xl font-bold text-amber-500">{certLoading ? '—' : certPendingCount}</p>
            <p className="text-xs text-gray-400 mt-1">เคส</p>
          </div>
          <div className="bg-white border-l-4 border-l-red-500 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">เกินกำหนดส่งแล้ว</p>
            <p className="text-3xl font-bold text-red-500">{certLoading ? '—' : certOverdueCount}</p>
            <p className="text-xs text-gray-400 mt-1">เคส</p>
          </div>
          <div className="bg-white border-l-4 border-l-sky-400 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ใกล้ครบกำหนด (วันนี้/พรุ่งนี้)</p>
            <p className="text-3xl font-bold text-sky-500">{certLoading ? '—' : certSoonCount}</p>
            <p className="text-xs text-gray-400 mt-1">เคส</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* ปฏิทิน */}
          <div className="col-span-2 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><IconChevronLeft size={16}/></button>
                <p className="text-sm font-semibold text-gray-700 w-40 text-center">{MONTHS_TH[calMonth]} {calYear + 543}</p>
                <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><IconChevronRight size={16}/></button>
              </div>
              <div className="flex items-center gap-3">
                <select value={certStatus} onChange={(e) => setCertStatus(e.target.value as any)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="ทั้งหมด">ทั้งหมด</option>
                  <option value="ยังไม่ส่ง">ยังไม่ส่ง</option>
                  <option value="ส่งแล้ว">ส่งแล้ว</option>
                </select>
                <button onClick={goToday} className="text-xs text-[#185FA5] hover:underline">วันนี้</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {DAYS_TH.map(d => <p key={d} className="text-xs text-center text-gray-400 font-medium py-1">{d}</p>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calCells.map((dateStr, i) => {
                if (!dateStr) return <div key={i} />
                const color = dayColor(dateStr)
                const dayCases = casesByDate[dateStr] || []
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const dayNum = Number(dateStr.slice(8,10))
                return (
                  <button key={i} onClick={() => setSelectedDate(dateStr)}
                    className={`aspect-square rounded-lg p-1.5 flex flex-col items-center justify-start text-left transition-all
                      ${isSelected ? 'ring-2 ring-[#185FA5]' : ''}
                      ${color ? color.bg : 'bg-gray-50 hover:bg-gray-100'}
                    `}>
                    <span className={`text-xs font-medium ${isToday ? 'bg-[#185FA5] text-white rounded-full w-5 h-5 flex items-center justify-center' : color ? color.text : 'text-gray-400'}`}>
                      {dayNum}
                    </span>
                    {dayCases.length > 0 && (
                      <span className={`text-xs mt-1 font-semibold ${color?.text}`}>{dayCases.length} เคส</span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-50">
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/>เกินกำหนด</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/>ใกล้ครบกำหนด</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-sky-400"/>ยังไม่ถึงกำหนด</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-green-400"/>ส่งครบแล้ว</span>
            </div>
          </div>

          {/* รายละเอียดวันที่เลือก */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">รายละเอียดวันที่เลือก</p>
            <p className="text-sm font-semibold text-gray-700 mb-4">
              {selectedDate ? new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : 'ยังไม่ได้เลือกวัน'}
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {selectedDayCases.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">ไม่มีรายการครบกำหนดวันนี้</p>
              ) : selectedDayCases.map((c, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-700">{c.customer_name}</p>
                  {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><IconPhone size={10}/>{c.phone}</p>}
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{c.case_number} · จอง {c.booking_date}</p>
                  <div className="flex items-center justify-between mt-2">
                    {urgencyBadge(c)}
                    {c.delivered ? (
                      <button onClick={() => handleUndoDelivered(c.mc_id)} className="text-xs text-gray-400 hover:text-red-500 hover:underline">ยกเลิก</button>
                    ) : (
                      <button onClick={() => handleMarkDelivered(c.mc_id)}
                        className="text-xs bg-[#185FA5] text-white px-2.5 py-1 rounded-lg hover:bg-[#0C447C] flex items-center gap-1">
                        <IconCheck size={11}/> นำส่งแล้ว
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===================== ส่วนที่ 2: ลูกหนี้ค้างชำระ (ของเดิม ไม่ได้แก้อะไร) ===================== */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-semibold text-gray-700">💳 ติดตามลูกหนี้ค้างชำระ</p>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filterOverdueOnly} onChange={(e) => setFilterOverdueOnly(e.target.checked)}
              className="rounded border-gray-300" />
            แสดงเฉพาะที่เกินกำหนด
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ยอดค้างรวม</p>
            <p className="text-3xl font-bold text-red-500">{loading ? '—' : `฿${totalOutstanding.toLocaleString()}`}</p>
          </div>
          <div className="bg-white border-l-4 border-l-red-500 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">เกินกำหนดชำระ</p>
            <p className="text-3xl font-bold text-red-500">{loading ? '—' : overdueCount}</p>
            <p className="text-xs text-gray-400 mt-1">เคส</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ลูกหนี้ทั้งหมด</p>
            <p className="text-3xl font-bold text-gray-800">{loading ? '—' : customerList.length}</p>
            <p className="text-xs text-gray-400 mt-1">ราย</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span className="col-span-2">ลูกค้า</span><span>เงื่อนไข</span>
            <span>ยอดค้างรวม</span><span>จำนวนเคส</span><span>เกินกำหนด</span><span></span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
          ) : customerList.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              <p className="text-2xl mb-1">✅</p>
              ไม่มีลูกหนี้ค้างชำระ
            </div>
          ) : (
            customerList.map((c: any, i) => (
              <div key={i} className="border-b border-gray-50">
                <div className="grid grid-cols-7 gap-2 px-5 py-3 text-sm hover:bg-gray-50 items-center">
                  <div className="col-span-2">
                    <p className="font-medium text-gray-700">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><IconPhone size={10}/>{c.phone}</p>}
                  </div>
                  <span className="text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${c.type === 'vip' ? 'bg-purple-50 text-purple-600' : c.type === 'credit' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                      {DUE_TYPE_LABELS[c.cases[0]?.due_type] || 'มาตรฐาน (3 วัน)'}
                    </span>
                  </span>
                  <span className="font-bold text-red-500">฿{c.total.toLocaleString()}</span>
                  <span className="text-gray-600">{c.cases.length} เคส</span>
                  <span>
                    {c.maxDaysOver > 0 ? (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium">
                        <IconAlertTriangle size={10}/> เกิน {c.maxDaysOver} วัน
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium">
                        <IconClock size={10}/> ยังไม่เกินกำหนด
                      </span>
                    )}
                  </span>
                  <button onClick={() => window.location.href='/customers'} className="text-xs text-[#185FA5] hover:underline text-right">ดูลูกค้า</button>
                </div>
                <div className="px-5 pb-3 pl-12 space-y-1">
                  {c.cases.map((cs: any, j: number) => (
                    <div key={j} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="text-gray-500 font-mono">{cs.case_number} · {cs.booking_date}</span>
                      <span className="text-gray-400">ครบกำหนด {cs.due_date}</span>
                      <span className="font-medium text-gray-700">฿{cs.outstanding.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}