'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconAlertTriangle, IconClock, IconPhone, IconCheck, IconDownload, IconSearch } from '@tabler/icons-react'

const DUE_TYPE_LABELS: any = {
  standard_3: 'มาตรฐาน (3 วัน)',
  vip_30: 'VIP (30 วัน)',
  fifth_next_month: 'วันที่ 5 เดือนถัดไป',
}

// คำนวณวันครบกำหนดชำระตาม due_type ของลูกค้า
function getDueDate(bookingDate: string, dueType: string) {
  const d = new Date(bookingDate)
  if (dueType === 'vip_30') {
    d.setDate(d.getDate() + 30)
    return d
  }
  if (dueType === 'fifth_next_month') {
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 5)
    return nextMonth
  }
  // standard_3 (default)
  d.setDate(d.getDate() + 3)
  return d
}

// กำหนดส่งใบแพทย์ให้ลูกค้า = วันจอง + 3 วันเสมอ (ไม่ขึ้นกับ due_type ของลูกหนี้)
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

  // ===== แจ้งเตือนส่งใบแพทย์ให้ลูกค้า =====
  const [certCases, setCertCases] = useState<any[]>([])
  const [certLoading, setCertLoading] = useState(true)
  const [certSearch, setCertSearch] = useState('')
  const [certDateFrom, setCertDateFrom] = useState('')
  const [certDateTo, setCertDateTo] = useState('')
  const [certStatus, setCertStatus] = useState('') // '' | 'ส่งแล้ว' | 'ยังไม่ส่ง'
  const [certUrgency, setCertUrgency] = useState('') // '' | 'เกินกำหนดแล้ว' | 'ใกล้ครบกำหนด' | 'ยังไม่ถึงกำหนด'

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
          due_date: dueDate.toISOString().slice(0,10),
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

  // ดึงรายการจองทั้งหมดที่ยังไม่ได้ส่งใบแพทย์ให้ลูกค้า (หรือส่งแล้วก็ดึงมาด้วยเผื่อกรองดู)
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
        if (!mc?.id) return null // ยังไม่มีการบันทึกตรวจจริงเลย ยังไม่ต้องแจ้งเตือน
        const dueDate = getCertDueDate(b.booking_date)
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
          due_date: dueDate.toISOString().slice(0,10),
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
      cert_delivered_at: new Date().toISOString().slice(0,10),
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

  const filteredCertCases = certCases.filter(c => {
    if (certSearch && !c.customer_name?.includes(certSearch) && !c.case_number?.includes(certSearch)) return false
    if (certDateFrom && c.booking_date < certDateFrom) return false
    if (certDateTo && c.booking_date > certDateTo) return false
    if (certStatus === 'ส่งแล้ว' && !c.delivered) return false
    if (certStatus === 'ยังไม่ส่ง' && c.delivered) return false
    if (certUrgency && c.urgency !== certUrgency) return false
    return true
  })

  const certPendingCount = certCases.filter(c => !c.delivered).length
  const certOverdueCount = certCases.filter(c => !c.delivered && c.urgency === 'เกินกำหนดแล้ว').length
  const certSoonCount = certCases.filter(c => !c.delivered && c.urgency === 'ใกล้ครบกำหนด').length

  const clearCertFilters = () => {
    setCertSearch(''); setCertDateFrom(''); setCertDateTo(''); setCertStatus(''); setCertUrgency('')
  }

  const exportCertExcel = () => {
    const rows = filteredCertCases.map(c => ({
      'เลขจอง': c.case_number,
      'ลูกค้า': c.customer_name,
      'เบอร์โทร': c.phone || '',
      'วันที่จอง': c.booking_date,
      'ครบกำหนดส่ง': c.due_date,
      'สถานะ': c.delivered ? 'ส่งแล้ว' : 'ยังไม่ส่ง',
      'ความเร่งด่วน': c.urgency,
      'วันที่ส่ง': c.delivered_at || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ส่งใบแพทย์')
    XLSX.writeFile(wb, `แจ้งเตือนส่งใบแพทย์_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const urgencyBadge = (c: any) => {
    if (c.delivered) return <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium"><IconCheck size={10}/> ส่งแล้ว</span>
    if (c.urgency === 'เกินกำหนดแล้ว') return <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium"><IconAlertTriangle size={10}/> เกิน {c.daysOver} วัน</span>
    if (c.urgency === 'ใกล้ครบกำหนด') return <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium"><IconClock size={10}/> ใกล้ครบกำหนด</span>
    return <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full w-fit font-medium">ยังไม่ถึงกำหนด</span>
  }

  const filtered = filterOverdueOnly ? debtCases.filter(c => c.isOverdue) : debtCases
  const totalOutstanding = filtered.reduce((s, c) => s + c.outstanding, 0)
  const overdueCount = debtCases.filter(c => c.isOverdue).length

  // จัดกลุ่มตามลูกค้า สำหรับสรุปยอดรวมต่อคน
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

        {/* ===================== ส่วนที่ 1: แจ้งเตือนส่งใบแพทย์ให้ลูกค้า ===================== */}
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

        {/* ตัวกรอง */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="grid grid-cols-5 gap-3">
            <div className="relative">
              <label className="text-xs text-gray-400 mb-1 block">ค้นหา</label>
              <IconSearch size={13} className="absolute left-2.5 top-7 text-gray-400"/>
              <input value={certSearch} onChange={(e) => setCertSearch(e.target.value)} placeholder="ลูกค้า / เลขจอง..."
                className="w-full pl-7 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่จอง เริ่ม</label>
              <input type="date" value={certDateFrom} onChange={(e) => setCertDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่จอง สิ้นสุด</label>
              <input type="date" value={certDateTo} onChange={(e) => setCertDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานะ</label>
              <select value={certStatus} onChange={(e) => setCertStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="ยังไม่ส่ง">ยังไม่ส่ง</option>
                <option value="ส่งแล้ว">ส่งแล้ว</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ความเร่งด่วน</label>
              <select value={certUrgency} onChange={(e) => setCertUrgency(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="เกินกำหนดแล้ว">เกินกำหนดแล้ว</option>
                <option value="ใกล้ครบกำหนด">ใกล้ครบกำหนด</option>
                <option value="ยังไม่ถึงกำหนด">ยังไม่ถึงกำหนด</option>
              </select>
            </div>
          </div>
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400">พบ <span className="font-semibold text-gray-600">{filteredCertCases.length}</span> รายการ</p>
            <button onClick={clearCertFilters} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-8">
          <div className="grid grid-cols-8 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span className="col-span-2">ลูกค้า</span><span>วันที่จอง</span>
            <span>ครบกำหนดส่ง</span><span className="col-span-2">สถานะ</span><span></span>
          </div>
          {certLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
          ) : filteredCertCases.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              <p className="text-2xl mb-1">✅</p>
              ไม่พบรายการ
            </div>
          ) : (
            filteredCertCases.map((c, i) => (
              <div key={i} className="grid grid-cols-8 gap-2 px-5 py-3 text-sm hover:bg-gray-50 items-center border-b border-gray-50">
                <span className="text-xs text-gray-400 font-mono">{c.case_number}</span>
                <div className="col-span-2">
                  <p className="font-medium text-gray-700 text-xs">{c.customer_name}</p>
                  {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><IconPhone size={10}/>{c.phone}</p>}
                </div>
                <span className="text-xs text-gray-500">{c.booking_date}</span>
                <span className="text-xs text-gray-500">{c.due_date}</span>
                <span className="col-span-2">{urgencyBadge(c)}</span>
                <span className="text-right">
                  {c.delivered ? (
                    <button onClick={() => handleUndoDelivered(c.mc_id)} className="text-xs text-gray-400 hover:text-red-500 hover:underline">ยกเลิก</button>
                  ) : (
                    <button onClick={() => handleMarkDelivered(c.mc_id)}
                      className="text-xs bg-[#185FA5] text-white px-2.5 py-1 rounded-lg hover:bg-[#0C447C] flex items-center gap-1 ml-auto">
                      <IconCheck size={11}/> นำส่งแล้ว
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>

        {/* ===================== ส่วนที่ 2: ลูกหนี้ค้างชำระ (เดิม) ===================== */}
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