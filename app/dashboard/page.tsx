'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconRefresh, IconChevronRight, IconInfoCircle, IconMicroscope, IconCalendarStats, IconActivityHeartbeat, IconDeviceSim, IconGripVertical, IconEye, IconEyeOff, IconLayoutGrid } from '@tabler/icons-react'

const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
const MONTHS_TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// ── Design tokens: Navy + Indigo + Violet, บนพื้นนิวทรัลสะอาด ──
const P = {
  bg: '#F7F8FC',
  card: '#FFFFFF',
  ink: '#0F172A',      // หัวข้อ / ตัวเลขใหญ่
  body: '#334155',
  muted: '#64748B',    // label
  faint: '#94A3B8',    // caption
  line: '#E9EAF2',     // เส้นขอบ
  track: '#EDEFF7',    // รางแถบ %

  navy: '#1E1B4B',
  navy2: '#312E81',
  primary: '#4338CA',  // แบรนด์
  indigo: '#4F46E5',   // ชุดข้อมูล 1
  violet: '#7C3AED',   // ชุดข้อมูล 2 / accent
  violetSoft: '#EDE9FE',
  teal: '#0D9488',     // ชุดข้อมูล 3
  amber: '#D97706',    // รอดำเนินการ
  rose: '#E11D48',     // แจ้งเตือน / หนี้
  emerald: '#059669',
}
const SERIES = [P.indigo, P.violet, P.teal, P.amber, '#64748B', '#0EA5E9']

// ── Widget layout ──
const LAYOUT_KEY = 'txrx_dash_layout_v1'
const DEFAULT_ORDER = ['pillars','kpi','trend','services','topCustomers','aging','inactive','debt','sim','special']
const WIDGET_TITLES: Record<string, string> = {
  pillars: '4 เสาหลัก',
  kpi: 'ตัวชี้วัดรอง',
  trend: 'แนวโน้มรายเดือน',
  services: 'แยกตามประเภทงาน',
  topCustomers: 'ลูกค้าที่ใช้บริการเยอะสุด',
  aging: 'ใบแพทย์ค้างส่ง',
  inactive: 'ลูกค้าที่หายไปนาน',
  debt: 'ยอดหนี้ค้างชำระ',
  sim: 'ยอดขายซิมตามแพ็กเกจ',
  special: 'ยอดตรวจพิเศษ',
}
const WIDGET_SPAN: Record<string, string> = {
  pillars: 'lg:col-span-6',
  kpi: 'lg:col-span-6',
  trend: 'lg:col-span-3',
  services: 'lg:col-span-3',
  topCustomers: 'lg:col-span-2',
  aging: 'lg:col-span-2',
  inactive: 'lg:col-span-2',
  debt: 'lg:col-span-6',
  sim: 'lg:col-span-3',
  special: 'lg:col-span-3',
}

const getMc = (b: any) => Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases

const localDateStr = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Dashboard() {
  const { user, role, ready, logout } = useAuth('/dashboard')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)

  const [kpi, setKpi] = useState({
    dtd: 0, dtdPrev: 0,
    wtd: 0, wtdAvg: 0, wtdPrevAvg: 0, wtdDays: 1,
    mtd: 0, mtdAvg: 0, mtdPrevAvg: 0, mtdDays: 1,
    utilization: 0,
    activeCustomers: 0, totalCustomers: 0,
    repeatRate: 0, repeatCount: 0,
    pendingPayments: 0, overdueCerts: 0, allPendingCerts: 0,
    revenue: 0, prevRevenue: 0,
    rangeTotal: 0, prevRangeTotal: 0,
    // 🔹 4 เสาหลักเพิ่มเติม
    rangeBooked: 0, prevRangeBooked: 0,
    rangeSim: 0, prevRangeSim: 0,
    rangeSpecialWorkers: 0, prevRangeSpecialWorkers: 0,
    prevActiveCustomers: 0,
  })

  const [peakDays, setPeakDays] = useState<number[]>([0,0,0,0,0,0,0])
  const [serviceBreakdown, setServiceBreakdown] = useState<any[]>([])
  const [prevServiceBreakdown, setPrevServiceBreakdown] = useState<any[]>([])
  const [topCustomers, setTopCustomers] = useState<any[]>([])
  const [agingCerts, setAgingCerts] = useState<any[]>([])
  const [inactiveCustomers, setInactiveCustomers] = useState<{ mou: any[], renew: any[] }>({ mou: [], renew: [] })
  const [debtByService, setDebtByService] = useState<any[]>([])
  const [totalDebt, setTotalDebt] = useState(0)
  const [simSummary, setSimSummary] = useState<any[]>([])
  const [specialExamSummary, setSpecialExamSummary] = useState<any[]>([])
  const [specialExamTotal, setSpecialExamTotal] = useState(0)
  const [specialExamTotalCount, setSpecialExamTotalCount] = useState(0)
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([])

  // ── layout state ──
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [hidden, setHidden] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const dragId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    try {
      const raw = localStorage.getItem(`${LAYOUT_KEY}_${user.id}`)
      if (raw) {
        const saved = JSON.parse(raw)
        if (Array.isArray(saved.order)) {
          const kept = saved.order.filter((id: string) => DEFAULT_ORDER.includes(id))
          const merged = [...kept, ...DEFAULT_ORDER.filter(id => !kept.includes(id))]
          setOrder(merged)
        }
        if (Array.isArray(saved.hidden)) setHidden(saved.hidden.filter((id: string) => DEFAULT_ORDER.includes(id)))
      }
    } catch {}
  }, [user?.id])

  const persistLayout = (nextOrder: string[], nextHidden: string[]) => {
    setOrder(nextOrder)
    setHidden(nextHidden)
    try {
      if (user?.id) localStorage.setItem(`${LAYOUT_KEY}_${user.id}`, JSON.stringify({ order: nextOrder, hidden: nextHidden }))
    } catch {}
  }
  const handleDrop = (targetId: string) => {
    const src = dragId.current
    dragId.current = null
    setDragOver(null)
    if (!src || src === targetId) return
    const next = order.filter(x => x !== src)
    const idx = next.indexOf(targetId)
    next.splice(idx < 0 ? next.length : idx, 0, src)
    persistLayout(next, hidden)
  }
  const hideWidget = (id: string) => persistLayout(order, [...hidden, id])
  const showWidget = (id: string) => persistLayout(order, hidden.filter(x => x !== id))
  const resetLayout = () => persistLayout(DEFAULT_ORDER, [])

  const now = new Date()
  const [filterMonth, setFilterMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const getDateRange = () => {
    if (filterDateFrom && filterDateTo) return { from: filterDateFrom, to: filterDateTo }
    if (filterMonth) {
      const [y, m] = filterMonth.split('-').map(Number)
      const from = `${y}-${String(m).padStart(2,'0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const to = `${y}-${String(m).padStart(2,'0')}-${lastDay}`
      return { from, to }
    }
    return { from: '', to: '' }
  }

  if (ready && !loaded) { fetchAll(); setLoaded(true) }

  async function fetchAll() {
    setLoading(true)
    const today = new Date(); today.setHours(0,0,0,0)
    const todayStr = localDateStr(today)
    const { from, to } = getDateRange()

    // DTD
    const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
    const yestStr = localDateStr(yesterday)
    const { data: todayBookings } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').eq('booking_date', todayStr)
    const { data: yestBookings } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').eq('booking_date', yestStr)
    const dtd = todayBookings?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const dtdPrev = yestBookings?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0

    // WTD
    const dayOfWeek = today.getDay()
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const wtdDays = diffToMon + 1
    const startOfW = new Date(today); startOfW.setDate(today.getDate() - diffToMon)
    const startOfLastW = new Date(startOfW); startOfLastW.setDate(startOfW.getDate() - 7)
    const endOfLastW = new Date(startOfLastW); endOfLastW.setDate(startOfLastW.getDate() + 6)
    const { data: wtdData } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').gte('booking_date', localDateStr(startOfW)).lte('booking_date', todayStr)
    const { data: lastWData } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').gte('booking_date', localDateStr(startOfLastW)).lte('booking_date', localDateStr(endOfLastW))
    const wtd = wtdData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const wtdAvg = wtd / wtdDays
    const lastWTotal = lastWData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const wtdPrevAvg = lastWTotal / 7

    // MTD
    const mtdDays = today.getDate()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth()-1, 1)
    const daysInLastMonth = lastMonthEnd.getDate()
    const { data: mtdData } = await supabase.from('bookings').select('booked_count, service_type, booking_date, medical_cases(actual_count), payments(amount_received)').gte('booking_date', firstOfMonth).lte('booking_date', todayStr)
    const { data: lastMData } = await supabase.from('bookings').select('booked_count, service_type, medical_cases(actual_count), payments(amount_received)').gte('booking_date', localDateStr(lastMonthStart)).lte('booking_date', localDateStr(lastMonthEnd))
    const mtd = mtdData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const mtdAvg = mtd / mtdDays
    const lastMTotal = lastMData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const mtdPrevAvg = lastMTotal / daysInLastMonth

    // Range Bookings
    let rangeQuery = supabase.from('bookings').select('*, customers(customer_name), medical_cases(*), payments(*), special_exams(*)')
    if (from) rangeQuery = rangeQuery.gte('booking_date', from)
    if (to) rangeQuery = rangeQuery.lte('booking_date', to)
    const { data: rangeData } = await rangeQuery.order('booking_date', { ascending: false })

    const f = new Date(from), t2 = new Date(to)
    const rangeDiff = t2.getTime() - f.getTime()
    const prevFrom = new Date(f.getTime() - rangeDiff - 86400000).toISOString().slice(0,10)
    const prevTo = new Date(f.getTime() - 86400000).toISOString().slice(0,10)
    let prevQuery = supabase.from('bookings').select('service_type, booked_count, sim_count, customers(customer_name), medical_cases(actual_count), payments(amount_received), special_exams(total_workers)')
    prevQuery = prevQuery.gte('booking_date', prevFrom).lte('booking_date', prevTo)
    const { data: prevData } = await prevQuery

    // คำนวณ 4 เสาหลัก
    const totalBooked = rangeData?.reduce((s,b) => s + (b.booked_count || 0), 0) || 0
    const totalActual = rangeData?.reduce((s,b) => s + (getMc(b)?.actual_count || 0), 0) || 0
    const totalSim = rangeData?.reduce((s,b) => s + (b.sim_count || 0), 0) || 0
    const totalSpecialWorkers = rangeData?.reduce((s,b) => {
      const spWorkers = b.special_exams?.reduce((spSum: number, sp: any) => spSum + (sp.total_workers || 0), 0) || 0
      return s + spWorkers
    }, 0) || 0

    const utilization = totalBooked > 0 ? Math.round((totalActual/totalBooked)*100) : 0
    const rangeTotal = totalActual
    const prevRangeTotal = prevData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const prevRangeBooked = prevData?.reduce((s,b) => s + (b.booked_count || 0), 0) || 0
    const prevRangeSim = prevData?.reduce((s,b) => s + (b.sim_count || 0), 0) || 0
    const prevRangeSpecialWorkers = prevData?.reduce((s,b) => s + (b.special_exams?.reduce((x: number, sp: any) => x + (sp.total_workers || 0), 0) || 0), 0) || 0
    const prevActiveCustomers = new Set(prevData?.map(b => (b.customers as any)?.customer_name).filter(Boolean)).size

    // Revenue
    const revenue = rangeData?.reduce((s,b) => s + ((Array.isArray(b.payments) ? b.payments?.[0] : b.payments)?.amount_received || 0), 0) || 0
    const prevRevenue = prevData?.reduce((s,b) => s + ((Array.isArray(b.payments) ? b.payments?.[0] : b.payments)?.amount_received || 0), 0) || 0

    // Peak days
    const days = [0,0,0,0,0,0,0]
    rangeData?.forEach(b => { const d = new Date(b.booking_date).getDay(); days[d] += (getMc(b)?.actual_count || b.booked_count || 0) })
    setPeakDays(days)

    // Service breakdown
    const services: any = {}, prevServices: any = {}
    rangeData?.forEach(b => { const s = b.service_type || 'ไม่ระบุ'; services[s] = (services[s]||0) + (getMc(b)?.actual_count || b.booked_count || 0) })
    prevData?.forEach(b => { const s = b.service_type || 'ไม่ระบุ'; prevServices[s] = (prevServices[s]||0) + (getMc(b)?.actual_count || b.booked_count || 0) })
    setServiceBreakdown(Object.entries(services).sort((a:any,b:any) => b[1]-a[1]).map(([k,v]) => ({ name: k, count: v as number })))
    setPrevServiceBreakdown(Object.entries(prevServices).map(([k,v]) => ({ name: k, count: v as number })))

    // Top customers
    const custCount: any = {}
    rangeData?.forEach(b => { const n = b.customers?.customer_name; if (n) custCount[n] = (custCount[n]||0) + (getMc(b)?.actual_count || b.booked_count || 0) })
    setTopCustomers(Object.entries(custCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,10).map(([name,count]) => ({ name, count })))

    // Active & Repeat
    const activeSet = new Set(rangeData?.map(b => b.customers?.customer_name).filter(Boolean))
    const custBookings: any = {}
    rangeData?.forEach(b => { const n = b.customers?.customer_name; if (n) custBookings[n] = (custBookings[n]||0) + 1 })
    const repeatCount = Object.values(custBookings).filter((v:any) => v > 1).length
    const repeatRate = activeSet.size > 0 ? Math.round((repeatCount/activeSet.size)*100) : 0

    // Retention
    const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate()-90)
    const { data: allBookings } = await supabase.from('bookings').select('booking_date, service_type, customers(customer_name)').gte('booking_date', localDateStr(ninetyDaysAgo)).lte('booking_date', yestStr)
    const lastSeen: any = {}
    allBookings?.forEach(b => {
      const n = (b.customers as any)?.customer_name
      if (!n) return
      if (!lastSeen[n] || b.booking_date > lastSeen[n].date) lastSeen[n] = { date: b.booking_date, type: b.service_type }
    })
    const mouList: any[] = [], renewList: any[] = []
    Object.keys(lastSeen).forEach(name => {
      const d = lastSeen[name]
      const daysAgo = Math.floor((today.getTime() - new Date(d.date).getTime()) / 86400000)
      if (daysAgo > 0) {
        const item = { name, daysAgo, lastDate: d.date }
        if (d.type === 'ไฟล์ทบิน') mouList.push(item)
        else renewList.push(item)
      }
    })
    setInactiveCustomers({
      mou: mouList.sort((a,b) => b.daysAgo-a.daysAgo).slice(0,5),
      renew: renewList.sort((a,b) => b.daysAgo-a.daysAgo).slice(0,5)
    })

    // 🔹 Aging certs (แก้ไข: ใช้ exam_date เป็นหลักในการนับวัน ให้ตรงกับหน้า /medical
    //    และดึง exam_date มาด้วย เพราะเดิมไม่มีคอลัมน์นี้ใน select เลยไม่มีทางคำนวณให้ตรงกันได้)
    let allYearMedical: any[] = []
    let agingFrom = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('case_number, booking_date, booked_count, customers(customer_name), medical_cases(id, actual_count, cert_count, cert_status, exam_date), special_exams(id)')
        .gte('booking_date', '2026-01-01')
        .lte('booking_date', todayStr)
        .range(agingFrom, agingFrom + 999)
      if (!chunk || chunk.length === 0) break
      allYearMedical = [...allYearMedical, ...chunk]
      if (chunk.length < 1000) break
      agingFrom += 1000
    }

    // 🔹 คำนวณรายการ "ค้างส่ง" ทั้งหมด (ไม่กรองวันที่) แล้วค่อยติดป้าย isOverdue แยกไว้
    //    เพื่อให้เอาไปแยกแสดงได้ทั้ง 2 แบบ: "เกินกำหนดจริง" และ "รอส่งทั้งหมด" (รวมที่ยังไม่เกินกำหนด)
    const agingList = (allYearMedical || [])
      .map(b => {
        const mc = getMc(b)
        const actual = mc?.actual_count || 0
        const certSent = mc?.cert_count || 0
        // ✅ ถ้ายังไม่เคยบันทึก "จำนวนตรวจจริง" เลย (actual_count ยังเป็น 0/ว่าง)
        // ไม่ควรฟันธงว่ามีเคสค้างส่ง เพราะยังไม่มีข้อมูลให้เทียบ
        const pending = actual > 0 ? Math.max(actual - certSent, 0) : 0

        // ✅ ใช้ exam_date (วันที่ตรวจจริง) เป็นตัวตั้งในการนับวัน ให้ตรงกับ logic ของหน้า /medical
        const refDate = mc?.exam_date || b.booking_date
        const daysOver = Math.floor((today.getTime() - new Date(refDate).getTime()) / 86400000)

        // เช็คตรวจพิเศษเพื่อขยายเวลาเป็น 14 วัน
        const hasSpecialExam = (b.special_exams && b.special_exams.length > 0)
        const allowedDays = hasSpecialExam ? 14 : 3
        const isOverdue = daysOver > allowedDays && pending > 0

        return {
          case_number: b.case_number,
          customer_name: (b.customers as any)?.customer_name,
          booking_date: refDate, // แสดงวันที่ตรวจจริงในการ์ด ให้ตรงกับตัวที่ใช้คำนวณ
          pending,
          daysOver,
          hasSpecialExam,
          isOverdue,
          cert_status: mc?.cert_status || 'รอบันทึก'
        }
      })
      // เอาเฉพาะเคสที่ยังส่งใบแพทย์ไม่ครบจริงๆ (ไม่สนใจว่าจะเกินกำหนดหรือยัง) และไม่ใช่สถานะพิเศษ
      .filter(b => b.pending > 0 && b.cert_status !== 'เรียบร้อย' && b.cert_status !== 'รอข้อมูลแรงงาน')
      // เรียงให้เคสที่เกินกำหนดขึ้นก่อน แล้วค่อยเรียงตามจำนวนวันที่ค้างมากไปน้อย
      .sort((a, b) => (Number(b.isOverdue) - Number(a.isOverdue)) || (b.daysOver - a.daysOver))

    // 🔹 นับ 2 ยอดแยกกัน: "เกินกำหนดจริง" (ต้องรีบส่ง) กับ "รอส่งทั้งหมด" (รวมเคสที่ยังไม่เกินกำหนด)
    const overdueOnly = agingList.filter(b => b.isOverdue)
    const totalOverdueCerts = overdueOnly.reduce((s, b) => s + b.pending, 0)
    const totalAllPendingCerts = agingList.reduce((s, b) => s + b.pending, 0)
    setAgingCerts(agingList.slice(0, 8))

    // ยอดหนี้ค้างชำระ
    let allDebtBookings: any[] = []
    let debtFrom = 0
    while (true) {
      const { data: chunk } = await supabase.from('bookings').select('service_type, payments(amount_received, total_amount, payment_status)').range(debtFrom, debtFrom + 999)
      if (!chunk || chunk.length === 0) break
      allDebtBookings = [...allDebtBookings, ...chunk]
      if (chunk.length < 1000) break
      debtFrom += 1000
    }
    const debtByType: any = {}
    let debtSum = 0
    allDebtBookings.forEach((b: any) => {
      const p = Array.isArray(b.payments) ? b.payments?.[0] : b.payments
      const status = p?.payment_status
      if (status === 'ยังไม่ชำระ' || status === 'ค้างชำระ' || status === 'เครดิต') {
        const outstanding = Math.max((p?.total_amount || 0) - (p?.amount_received || 0), 0)
        if (outstanding > 0) {
          const s = b.service_type || 'ไม่ระบุ'
          debtByType[s] = (debtByType[s] || 0) + outstanding
          debtSum += outstanding
        }
      }
    })
    const { data: openingBalances } = await supabase.from('customers').select('opening_balance')
    const openingSum = (openingBalances || []).reduce((s: number, c: any) => s + (c.opening_balance || 0), 0)
    debtSum += openingSum
    if (openingSum > 0) debtByType['ยอดยกมา (ก่อนใช้ระบบ)'] = openingSum
    setDebtByService(Object.entries(debtByType).sort((a: any, b: any) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })))
    setTotalDebt(debtSum)

    // สรุปยอดขายซิม
    let allSimItems: any[] = []
    let simFrom = 0
    while (true) {
      const { data: chunk } = await supabase.from('sim_items').select('booking_id, sim_package, sim_type, sim_count, bookings(booking_date)').range(simFrom, simFrom + 999)
      if (!chunk || chunk.length === 0) break
      allSimItems = [...allSimItems, ...chunk]
      if (chunk.length < 1000) break
      simFrom += 1000
    }
    const bookingIdsWithSimItems = new Set(allSimItems.map((s: any) => s.booking_id))

    let allLegacySimBookings: any[] = []
    let legacyFrom = 0
    while (true) {
      const { data: chunk } = await supabase.from('bookings').select('id, sim_count, sim_package, booking_date').gt('sim_count', 0).range(legacyFrom, legacyFrom + 999)
      if (!chunk || chunk.length === 0) break
      allLegacySimBookings = [...allLegacySimBookings, ...chunk]
      if (chunk.length < 1000) break
      legacyFrom += 1000
    }
    const legacySimItems = allLegacySimBookings
      .filter((b: any) => !bookingIdsWithSimItems.has(b.id))
      .map((b: any) => ({
        sim_package: b.sim_package ? b.sim_package : 'ไม่ระบุแพ็คเกจ (ข้อมูลเก่า)',
        sim_type: 'ไม่ระบุ',
        sim_count: b.sim_count,
        bookings: { booking_date: b.booking_date },
      }))

    const combinedSimItems = [...allSimItems, ...legacySimItems]
    const simInRange = combinedSimItems.filter((s: any) => {
      const d = s.bookings?.booking_date
      if (!d) return false
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
    const simGroup: any = {}
    simInRange.forEach((s: any) => {
      const key = `${s.sim_package || 'ไม่ระบุ'}|${s.sim_type || 'ไม่ระบุ'}`
      simGroup[key] = (simGroup[key] || 0) + (s.sim_count || 0)
    })
    setSimSummary(Object.entries(simGroup).sort((a: any, b: any) => b[1] - a[1]).map(([key, count]) => {
      const [pkg, type] = key.split('|')
      return { package: pkg, type, count }
    }))

    // สรุปยอดตรวจพิเศษ
    let allSpecialItems: any[] = []
    let spFrom = 0
    while (true) {
      const { data: chunk } = await supabase.from('special_exam_items').select('exam_name, quantity, subtotal, special_exams(exam_date)').range(spFrom, spFrom + 999)
      if (!chunk || chunk.length === 0) break
      allSpecialItems = [...allSpecialItems, ...chunk]
      if (chunk.length < 1000) break
      spFrom += 1000
    }
    const specialInRange = allSpecialItems.filter((s: any) => {
      const d = s.special_exams?.exam_date
      if (!d) return false
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
    const specialGroup: any = {}
    let specialSum = 0
    specialInRange.forEach((s: any) => {
      const name = s.exam_name || 'ไม่ระบุ'
      if (!specialGroup[name]) specialGroup[name] = { count: 0, amount: 0 }
      specialGroup[name].count += s.quantity || 0
      specialGroup[name].amount += s.subtotal || 0
      specialSum += s.subtotal || 0
    })
    setSpecialExamSummary(Object.entries(specialGroup).sort((a: any, b: any) => b[1].amount - a[1].amount).map(([name, v]: any) => ({ name, count: v.count, amount: v.amount })))
    setSpecialExamTotal(specialSum)
    setSpecialExamTotalCount(Object.values(specialGroup).reduce((s: number, v: any) => s + v.count, 0))

    // Monthly Trend
    const monthsBack = 5
    const trendStartDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1)
    const trendEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    let allTrendBookings: any[] = []
    let trendFrom = 0
    while (true) {
      const { data: chunk } = await supabase.from('bookings').select('booking_date, booked_count, medical_cases(actual_count), payments(amount_received)').gte('booking_date', localDateStr(trendStartDate)).lte('booking_date', localDateStr(trendEndDate)).range(trendFrom, trendFrom + 999)
      if (!chunk || chunk.length === 0) break
      allTrendBookings = [...allTrendBookings, ...chunk]
      if (chunk.length < 1000) break
      trendFrom += 1000
    }
    const monthMap: any = {}
    for (let i = 0; i <= monthsBack; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - monthsBack + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      monthMap[key] = { key, count: 0, revenue: 0, label: MONTHS_TH_SHORT[d.getMonth()], year: d.getFullYear() }
    }
    allTrendBookings.forEach((b: any) => {
      const key = b.booking_date?.slice(0,7)
      if (!key || !monthMap[key]) return
      monthMap[key].count += (getMc(b)?.actual_count || b.booked_count || 0)
      monthMap[key].revenue += ((Array.isArray(b.payments) ? b.payments?.[0] : b.payments)?.amount_received || 0)
    })
    setMonthlyTrend(Object.values(monthMap))

    const { data: allCustomers } = await supabase.from('customers').select('id')
    const { data: pendingData } = await supabase.from('payments').select('id').in('payment_status', ['ยังไม่ชำระ','ค้างชำระ'])

    setKpi({
      dtd, dtdPrev, wtd, wtdAvg, wtdPrevAvg, wtdDays,
      mtd, mtdAvg, mtdPrevAvg, mtdDays,
      utilization,
      activeCustomers: activeSet.size,
      totalCustomers: allCustomers?.length || 0,
      repeatRate, repeatCount,
      pendingPayments: pendingData?.length || 0,
      overdueCerts: totalOverdueCerts,
      allPendingCerts: totalAllPendingCerts,
      revenue, prevRevenue,
      rangeTotal, prevRangeTotal,
      rangeBooked: totalBooked, prevRangeBooked,
      rangeSim: totalSim, prevRangeSim,
      rangeSpecialWorkers: totalSpecialWorkers, prevRangeSpecialWorkers,
      prevActiveCustomers,
    })
    setLoading(false)
  }

  const handleFilter = () => { setLoaded(false) }
  const { from, to } = getDateRange()

  type CmpTone = 'up' | 'down' | 'flat'
  type CompareResult = { pctText: string | null; absText: string; tone: CmpTone; note: string | null }
  // ค่าเทียบ = ช่วงเวลาก่อนหน้าที่ยาวเท่ากัน (เดือนนี้↔เดือนก่อน ฯลฯ)
  const fmtDelta = (n: number, unit = '') => {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '±'
    const mag = Math.abs(Math.round(n)).toLocaleString()
    return unit === '฿' ? `${sign}฿${mag}` : `${sign}${mag}${unit ? ' ' + unit : ''}`
  }
  const compareValues = (cur: number, prev: number, unit = '', minBaseForPct = 5): CompareResult => {
    if (cur === 0 && prev === 0) return { pctText: null, absText: '', tone: 'flat', note: 'ยังไม่มีข้อมูล' }
    if (prev === 0) return { pctText: null, absText: fmtDelta(cur, unit), tone: 'up', note: 'ช่วงก่อนยังไม่มีข้อมูล' }
    const diff = cur - prev
    const up = diff >= 0
    const tone: CmpTone = diff === 0 ? 'flat' : up ? 'up' : 'down'
    const pctText = prev >= minBaseForPct ? `${up ? '+' : '−'}${Math.abs(Math.round((diff / prev) * 100))}%` : null
    return { pctText, absText: fmtDelta(diff, unit), tone, note: null }
  }

  const TrendPill = ({ cur, prev, label, unit = '', onDark }: { cur: number, prev: number, label?: string, unit?: string, onDark?: boolean }) => {
    const r = compareValues(cur, prev, unit)
    const base = 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums'
    const tone = onDark
      ? { up: 'bg-white/15 text-emerald-200', down: 'bg-white/15 text-rose-200', flat: 'bg-white/10 text-white/60' }
      : { up: 'bg-emerald-50 text-emerald-700', down: 'bg-rose-50 text-rose-600', flat: 'bg-slate-100 text-slate-500' }
    const capTone = onDark ? 'text-white/55' : 'text-slate-400'
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className={`${base} ${tone[r.tone]}`}>
          {r.tone === 'up' && <IconTrendingUp size={11}/>}
          {r.tone === 'down' && <IconTrendingDown size={11}/>}
          {r.note ?? r.pctText ?? r.absText}
        </span>
        {!r.note && r.pctText && <span className={`text-[11px] tabular-nums ${capTone}`}>{r.absText}</span>}
        {label && <span className={`text-[11px] ${capTone}`}>{label}</span>}
      </span>
    )
  }

  // ── helpers ──
  const maxCust = (topCustomers[0]?.count as number) || 1
  const fmtPct = (n: number) => `${n > 0 && n < 10 ? n.toFixed(1) : Math.round(n)}%`
  const fmtBaht = (n: number) => `฿${Math.round(n || 0).toLocaleString()}`
  const cmpLabel = (filterDateFrom && filterDateTo) ? 'เทียบช่วงก่อน' : 'เทียบเดือนก่อน'
  const pctOfActual = (n: number) => (kpi.rangeTotal > 0 ? (n / kpi.rangeTotal) * 100 : 0)
  const specialPct = pctOfActual(kpi.rangeSpecialWorkers)
  const simPct = pctOfActual(kpi.rangeSim)
  const actualVsBooked = kpi.rangeBooked > 0 ? (kpi.rangeTotal / kpi.rangeBooked) * 100 : 0
  const simTotalCount = simSummary.reduce((s: number, x: any) => s + x.count, 0)
  const specialAvgPerHead = specialExamTotalCount > 0 ? specialExamTotal / specialExamTotalCount : 0

  const CARD = 'bg-white rounded-xl border border-[#E9EAF2] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.05)]'
  const svcColor = (name: string, i = 0) => {
    const map: Record<string, string> = {
      'ตรวจนอกสถานที่ (Mobile)': P.indigo, 'คลินิก': P.violet, 'Walk-in': P.teal, 'ไฟล์ทบิน': P.amber,
    }
    return map[name] || SERIES[i % SERIES.length]
  }

  const SectionHead = ({ dot, title, sub, right }: { dot?: string, title: string, sub?: string, right?: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
          <h3 className="text-[13px] font-bold" style={{ color: P.ink }}>{title}</h3>
        </div>
        {sub && <p className="text-xs mt-1" style={{ color: P.faint }}>{sub}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  )

  const Bar = ({ pct, color, className = '' }: { pct: number, color?: string, className?: string }) => (
    <div className={`w-full rounded-full h-1.5 ${className}`} style={{ background: P.track }}>
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color || P.indigo }} />
    </div>
  )

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: P.bg, color: P.faint }}>กำลังโหลด...</div>

  const pillars = [
    { key: 'booked', label: 'ยอดจองรวม', en: 'Booked', icon: IconCalendarStats, color: P.navy2,
      value: kpi.rangeBooked, unit: 'คน', note: 'จำนวนคนที่นัดหมายเข้ามาในช่วงนี้', bar: 100, badge: null as string | null,
      trend: { cur: kpi.rangeBooked, prev: kpi.prevRangeBooked, unit: 'คน' } },
    { key: 'actual', label: 'ยอดตรวจจริง', en: 'Actual', icon: IconActivityHeartbeat, color: P.indigo,
      value: kpi.rangeTotal, unit: 'คน', note: `มาตรวจจริง ${fmtPct(actualVsBooked)} ของยอดจอง (${kpi.rangeBooked.toLocaleString()} คน)`, bar: actualVsBooked, badge: null as string | null,
      trend: { cur: kpi.rangeTotal, prev: kpi.prevRangeTotal, unit: 'คน' } },
    { key: 'special', label: 'ยอดตรวจพิเศษ', en: 'Special', icon: IconMicroscope, color: P.violet,
      value: kpi.rangeSpecialWorkers, unit: 'คน', note: `${fmtPct(specialPct)} ของผู้มาตรวจทั้งหมด (${kpi.rangeTotal.toLocaleString()} คน)`, bar: specialPct, badge: fmtPct(specialPct),
      trend: { cur: kpi.rangeSpecialWorkers, prev: kpi.prevRangeSpecialWorkers, unit: 'คน' } },
    { key: 'sim', label: 'ยอดขายซิม', en: 'Sim', icon: IconDeviceSim, color: P.teal,
      value: kpi.rangeSim, unit: 'ซิม', note: `เฉลี่ย ${fmtPct(simPct)} เทียบผู้มาตรวจ (${kpi.rangeTotal.toLocaleString()} คน)`, bar: simPct, badge: fmtPct(simPct),
      trend: { cur: kpi.rangeSim, prev: kpi.prevRangeSim, unit: 'ซิม' } },
  ]

  const heroStats = [
    { label: 'วันนี้', value: kpi.dtd, cur: kpi.dtd, prev: kpi.dtdPrev, cmp: 'เทียบเมื่อวาน', unit: 'คน', sub: `เมื่อวาน ${kpi.dtdPrev.toLocaleString()} คน` },
    { label: 'สัปดาห์นี้', value: kpi.wtd, cur: kpi.wtdAvg, prev: kpi.wtdPrevAvg, cmp: 'เทียบสัปดาห์ก่อน (เฉลี่ย/วัน)', unit: 'คน', sub: `เฉลี่ย ${loading ? '—' : kpi.wtdAvg.toFixed(1)}/วัน · สัปดาห์ก่อน ${loading ? '—' : kpi.wtdPrevAvg.toFixed(1)}/วัน` },
    { label: 'เดือนนี้', value: kpi.mtd, cur: kpi.mtdAvg, prev: kpi.mtdPrevAvg, cmp: 'เทียบเดือนก่อน (เฉลี่ย/วัน)', unit: 'คน', sub: `เฉลี่ย ${loading ? '—' : kpi.mtdAvg.toFixed(1)}/วัน · เดือนก่อน ${loading ? '—' : kpi.mtdPrevAvg.toFixed(1)}/วัน` },
  ]

  // ── widget content ──
  const WIDGETS: Record<string, React.ReactNode> = {
    pillars: (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {pillars.map((p) => (
          <div key={p.key} className={`${CARD} p-4 relative overflow-hidden`}>
            <span className="absolute left-0 top-0 h-full w-1" style={{ background: p.color }} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${p.color}14`, color: p.color }}>
                  <p.icon size={17}/>
                </span>
                <div className="leading-tight">
                  <p className="text-[12px] font-semibold" style={{ color: P.body }}>{p.label}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: P.faint }}>{p.en}</p>
                </div>
              </div>
              {p.badge && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums" style={{ background: `${p.color}14`, color: p.color }}>
                  {loading ? '—' : p.badge}
                </span>
              )}
            </div>
            <p className="text-[30px] leading-none font-bold mt-3 tabular-nums" style={{ color: P.ink }}>
              {loading ? '—' : p.value.toLocaleString()}
              <span className="text-xs font-medium ml-1.5" style={{ color: P.faint }}>{p.unit}</span>
            </p>
            <Bar pct={loading ? 0 : p.bar} color={p.color} className="mt-3" />
            <p className="text-[11px] mt-2" style={{ color: P.faint }}>{loading ? '—' : p.note}</p>
            {p.trend && !loading && (
              <div className="mt-1.5">
                <TrendPill cur={p.trend.cur} prev={p.trend.prev} unit={p.trend.unit} label={cmpLabel} />
              </div>
            )}
          </div>
        ))}
      </div>
    ),

    kpi: (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${CARD} p-4`}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: P.faint }}>อัตรามาตรวจจริง</p>
          <p className="text-[26px] leading-none font-bold mt-1.5 tabular-nums" style={{ color: P.ink }}>{loading ? '—' : `${kpi.utilization}%`}</p>
          <Bar pct={kpi.utilization} color={P.indigo} className="mt-2.5" />
          <p className="text-[11px] mt-1.5" style={{ color: P.faint }}>
            {loading ? '—' : `มาตรวจ ${kpi.rangeTotal.toLocaleString()} คน จากจอง ${kpi.rangeBooked.toLocaleString()} คน`}
            {!loading && kpi.utilization > 100 && <span style={{ color: P.emerald }}> · มามากกว่าที่จอง</span>}
          </p>
        </div>
        <div className={`${CARD} p-4 cursor-pointer hover:border-indigo-200 transition-colors`} onClick={() => window.location.href='/payments'}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: P.faint }}>รับเงินช่วงนี้</p>
          <p className="text-[22px] leading-none font-bold mt-1.5 tabular-nums" style={{ color: P.teal }}>{loading ? '฿—' : fmtBaht(kpi.revenue)}</p>
          <div className="mt-2"><TrendPill cur={kpi.revenue} prev={kpi.prevRevenue} label={cmpLabel} unit="฿" /></div>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: P.faint }}>ลูกค้าที่ใช้บริการ</p>
          <p className="text-[26px] leading-none font-bold mt-1.5 tabular-nums" style={{ color: P.ink }}>{loading ? '—' : kpi.activeCustomers.toLocaleString()}</p>
          <p className="text-[11px] mt-2" style={{ color: P.faint }}>
            {kpi.totalCustomers > 0 ? `${fmtPct((kpi.activeCustomers / kpi.totalCustomers) * 100)} ` : ''}จากลูกค้าทั้งหมด {kpi.totalCustomers.toLocaleString()} ราย
          </p>
          {!loading && <div className="mt-1.5"><TrendPill cur={kpi.activeCustomers} prev={kpi.prevActiveCustomers} label={cmpLabel} unit="ราย" /></div>}
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: P.faint }}>ลูกค้ากลับมาซ้ำ</p>
          <p className="text-[26px] leading-none font-bold mt-1.5 tabular-nums" style={{ color: P.ink }}>{loading ? '—' : `${kpi.repeatRate}%`}</p>
          <Bar pct={kpi.repeatRate} color={P.violet} className="mt-2.5" />
          <p className="text-[11px] mt-1.5" style={{ color: P.faint }}>
            {loading ? '—' : `${kpi.repeatCount.toLocaleString()} จาก ${kpi.activeCustomers.toLocaleString()} ราย มาใช้บริการ 2 ครั้งขึ้นไปในช่วงนี้`}
          </p>
        </div>
      </div>
    ),

    trend: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.indigo} title="แนวโน้มรายเดือน" sub="จำนวนคนตรวจ + รายได้ ย้อนหลัง 6 เดือน (ไม่ขึ้นกับตัวกรอง)" />
        <div className="flex items-end gap-2.5 h-44">
          {monthlyTrend.map((m, i) => {
            const maxCount = Math.max(...monthlyTrend.map(x => x.count), 1)
            const isCurrent = i === monthlyTrend.length - 1
            const barPct = Math.round((m.count/maxCount)*100)
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-bold tabular-nums" style={{ color: isCurrent ? P.indigo : P.muted }}>{m.count > 0 ? m.count.toLocaleString() : ''}</span>
                <div className="w-full flex items-end" style={{ height: '104px' }}>
                  <div className="w-full rounded-md transition-all duration-500" style={{
                    height: `${barPct}%`, minHeight: m.count > 0 ? '6px' : '2px',
                    background: isCurrent ? `linear-gradient(180deg, ${P.violet}, ${P.indigo})` : '#DDDEF2'
                  }}/>
                </div>
                <span className="text-[11px]" style={{ color: isCurrent ? P.ink : P.faint, fontWeight: isCurrent ? 700 : 500 }}>{m.label}</span>
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: P.teal }}>฿{m.revenue >= 1000 ? `${Math.round(m.revenue/1000)}k` : m.revenue}</span>
              </div>
            )
          })}
          {monthlyTrend.length === 0 && !loading && <p className="text-sm w-full text-center" style={{ color: P.faint }}>ไม่มีข้อมูล</p>}
        </div>
      </div>
    ),

    services: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.violet} title="แยกตามประเภทงาน" sub="แถบ = สัดส่วนของยอดตรวจจริงทั้งหมด · ตัวเลขขวา = เทียบช่วงก่อน" />
        <div className="space-y-3.5">
          {serviceBreakdown.length === 0 && !loading && <p className="text-sm text-center py-4" style={{ color: P.faint }}>ไม่มีข้อมูล</p>}
          {serviceBreakdown.map((s, i) => {
            const prev = prevServiceBreakdown.find(p => p.name === s.name)?.count || 0
            const share = kpi.rangeTotal > 0 ? (s.count / kpi.rangeTotal) * 100 : 0
            const color = svcColor(s.name, i)
            return (
              <div key={s.name}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[13px]" style={{ color: P.body }}>{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: P.track, color: P.muted }}>{fmtPct(share)}</span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: P.ink }}>{s.count.toLocaleString()}</span>
                    <TrendPill cur={s.count} prev={prev} unit="คน" />
                  </div>
                </div>
                <Bar pct={share} color={color} />
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-3.5 border-t grid grid-cols-2 gap-2.5" style={{ borderColor: P.line }}>
          <div className="rounded-lg p-3 cursor-pointer bg-rose-50 border border-rose-100 hover:bg-rose-100/60 transition-colors" onClick={() => window.location.href='/payments'}>
            <p className="text-[11px] font-semibold text-rose-600">รอเก็บเงิน</p>
            <p className="text-xl font-bold text-rose-600 tabular-nums mt-0.5">{kpi.pendingPayments}</p>
            <p className="text-[10px] text-rose-500/80">รายการ (ยังไม่ชำระ/ค้างชำระ)</p>
          </div>
          <div className="rounded-lg p-3 cursor-pointer bg-amber-50 border border-amber-100 hover:bg-amber-100/60 transition-colors" onClick={() => window.location.href='/medical'}>
            <p className="text-[11px] font-semibold text-amber-700">รอส่งใบแพทย์</p>
            <p className="text-xl font-bold text-amber-600 tabular-nums mt-0.5">{kpi.allPendingCerts.toLocaleString()}</p>
            <p className="text-[10px] text-amber-600/80">ใบ{kpi.overdueCerts > 0 ? ` · เกินกำหนด ${kpi.overdueCerts.toLocaleString()}` : ''}</p>
          </div>
        </div>
      </div>
    ),

    topCustomers: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.indigo} title="ลูกค้าที่ใช้บริการเยอะสุด" sub="% = สัดส่วนของยอดตรวจจริงทั้งหมด"
          right={<span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: P.track, color: P.muted }}>{topCustomers.length} ราย</span>} />
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {topCustomers.length === 0 && !loading && <p className="text-sm text-center py-4" style={{ color: P.faint }}>ไม่มีข้อมูล</p>}
          {topCustomers.map((c, i) => {
            const share = kpi.rangeTotal > 0 ? (c.count / kpi.rangeTotal) * 100 : 0
            return (
              <div key={c.name} className="flex items-center gap-2.5">
                <span className="text-[11px] w-4 text-right font-mono" style={{ color: P.faint }}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[12px] truncate" style={{ color: P.body }}>{c.name}</span>
                    <span className="text-[11px] ml-2 flex-shrink-0 tabular-nums" style={{ color: P.muted }}>
                      <span className="font-bold" style={{ color: P.ink }}>{c.count.toLocaleString()}</span> · {fmtPct(share)}
                    </span>
                  </div>
                  <Bar pct={Math.round((c.count/maxCust)*100)} color={P.indigo} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    ),

    aging: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.rose} title="ใบแพทย์ค้างส่ง"
          sub="แดง = เกินกำหนด (ปกติ 3 วัน / ตรวจพิเศษ 14 วัน) · เหลือง = ยังไม่เกินแต่ส่งไม่ครบ"
          right={
            <div className="flex flex-col items-end gap-1">
              <span className="text-[11px] bg-rose-50 text-rose-600 font-semibold px-2 py-0.5 rounded-full tabular-nums">เกิน {kpi.overdueCerts.toLocaleString()}</span>
              <span className="text-[11px] bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full tabular-nums">รวม {kpi.allPendingCerts.toLocaleString()}</span>
            </div>
          } />
        <div className="space-y-2">
          {agingCerts.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-2xl mb-1">✅</p>
              <p className="text-sm text-emerald-600 font-semibold">ไม่มีใบแพทย์ค้างส่ง</p>
              <p className="text-xs text-emerald-500 mt-1">ทุกเคสส่งครบแล้ว</p>
            </div>
          )}
          {agingCerts.map((c, i) => (
            <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${c.isOverdue ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-[12px] font-semibold truncate" style={{ color: P.body }}>{c.customer_name}</p>
                  {c.hasSpecialExam && <span className="text-[9px] font-semibold px-1 rounded flex-shrink-0 bg-violet-100 text-violet-700">ตรวจพิเศษ</span>}
                  {!c.isOverdue && <span className="text-[9px] font-semibold px-1 rounded flex-shrink-0 bg-slate-100 text-slate-500">ยังไม่เกิน</span>}
                </div>
                <p className="text-[11px]" style={{ color: P.faint }}>{c.case_number} · {c.booking_date}</p>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className={`text-[12px] font-bold tabular-nums ${c.isOverdue ? 'text-rose-600' : 'text-amber-700'}`}>ค้าง {c.pending}</p>
                <span className={`text-[10px] flex items-center gap-0.5 justify-end ${c.isOverdue ? 'text-rose-400' : 'text-amber-500'}`}>
                  <IconAlertTriangle size={9}/> {c.daysOver} วัน
                </span>
              </div>
            </div>
          ))}
          {agingCerts.length > 0 && (
            <button onClick={() => window.location.href='/medical'} className="w-full text-[11px] flex items-center justify-center gap-1 pt-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
              ดูทั้งหมด <IconChevronRight size={12}/>
            </button>
          )}
        </div>
      </div>
    ),

    inactive: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.amber} title="ลูกค้าที่หายไปนาน" sub="ไม่มาใช้บริการเกิน 90 วัน" />
        <div className="mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: P.indigo }}>ไฟล์ทบิน / MOU</p>
          <div className="space-y-1.5">
            {inactiveCustomers.mou.length === 0 && <p className="text-xs" style={{ color: P.faint }}>ไม่มี</p>}
            {inactiveCustomers.mou.map(c => (
              <div key={c.name} className="flex items-center justify-between py-1 border-b" style={{ borderColor: P.line }}>
                <span className="text-[12px] truncate flex-1" style={{ color: P.body }}>{c.name}</span>
                <span className="text-[11px] ml-2 flex-shrink-0 tabular-nums" style={{ color: P.faint }}>{c.daysAgo} วัน</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t pt-3" style={{ borderColor: P.line }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-amber-700">กลุ่มอื่นๆ (ควรติดต่อ)</p>
          <div className="space-y-1.5">
            {inactiveCustomers.renew.length === 0 && <p className="text-xs" style={{ color: P.faint }}>ไม่มี</p>}
            {inactiveCustomers.renew.map(c => (
              <div key={c.name} className="flex items-center justify-between py-1 border-b" style={{ borderColor: P.line }}>
                <span className="text-[12px] truncate flex-1" style={{ color: P.body }}>{c.name}</span>
                <span className="text-[11px] ml-2 flex-shrink-0 tabular-nums" style={{ color: P.faint }}>{c.daysAgo} วัน</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),

    debt: (
      <div className={`${CARD} p-5`}>
        <SectionHead dot={P.rose} title="ยอดหนี้ค้างชำระทั้งหมด" sub="รวมยอดยกมาก่อนใช้ระบบ · % = สัดส่วนของหนี้ทั้งหมด"
          right={<span className="text-lg font-bold text-rose-600 tabular-nums">฿{loading ? '—' : totalDebt.toLocaleString()}</span>} />
        {debtByService.length === 0 && !loading ? (
          <p className="text-sm text-center py-4" style={{ color: P.faint }}>ไม่มียอดค้างชำระ</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {debtByService.map((d, i) => {
              const isOpening = d.name === 'ยอดยกมา (ก่อนใช้ระบบ)'
              const color = isOpening ? P.amber : svcColor(d.name, i)
              const share = totalDebt > 0 ? (d.amount / totalDebt) * 100 : 0
              return (
                <div key={d.name} className="rounded-lg p-3 cursor-pointer border hover:shadow-sm transition-shadow" style={{ borderColor: P.line, background: '#FCFCFE' }} onClick={() => window.location.href='/customers'}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }}/>
                    <p className="text-[11px] truncate" style={{ color: P.muted }}>{d.name}</p>
                  </div>
                  <p className="text-[15px] font-bold tabular-nums" style={{ color: P.ink }}>฿{d.amount.toLocaleString()}</p>
                  <Bar pct={share} color={color} className="mt-1.5" />
                  <p className="text-[10px] mt-1 tabular-nums" style={{ color: P.faint }}>{fmtPct(share)} ของหนี้ทั้งหมด</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    ),

    sim: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.teal} title="ยอดขายซิมตามแพ็กเกจ" sub="% = สัดส่วนของซิมทั้งหมดในช่วงที่กรอง"
          right={
            <div className="text-right">
              <span className="text-[13px] font-bold block tabular-nums" style={{ color: P.teal }}>{loading ? '—' : simTotalCount.toLocaleString()} ซิม</span>
              <span className="text-[11px]" style={{ color: P.faint }}>{loading ? '—' : fmtPct(simPct)} ของยอดตรวจจริง</span>
            </div>
          } />
        {simSummary.length === 0 && !loading ? (
          <p className="text-sm text-center py-4" style={{ color: P.faint }}>ไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <div className="space-y-2">
            {simSummary.map((s, i) => {
              const isLegacy = s.package === 'ไม่ระบุแพ็คเกจ (ข้อมูลเก่า)'
              const share = simTotalCount > 0 ? (s.count / simTotalCount) * 100 : 0
              return (
                <div key={i} className="rounded-lg px-3 py-2.5 border" style={{ borderColor: P.line, background: isLegacy ? '#F8FAFC' : '#FCFCFE' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[13px] font-semibold" style={{ color: isLegacy ? P.faint : P.body }}>
                        {isLegacy ? s.package : `฿${s.package}/เดือน`}
                      </span>
                      <span className="text-[11px] ml-2" style={{ color: P.faint }}>{s.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: P.track, color: P.muted }}>{fmtPct(share)}</span>
                      <span className="text-[13px] font-bold tabular-nums" style={{ color: isLegacy ? P.faint : P.teal }}>{s.count} ซิม</span>
                    </div>
                  </div>
                  <Bar pct={share} color={isLegacy ? '#CBD5E1' : P.teal} className="mt-2" />
                </div>
              )
            })}
            <div className="flex justify-between items-center pt-2.5 border-t" style={{ borderColor: P.line }}>
              <span className="text-[12px] font-semibold" style={{ color: P.muted }}>รวมทั้งหมด</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: P.ink }}>{simTotalCount} ซิม</span>
            </div>
          </div>
        )}
      </div>
    ),

    special: (
      <div className={`${CARD} p-5 h-full`}>
        <SectionHead dot={P.violet} title="ยอดตรวจพิเศษ" sub={`เฉลี่ย ฿${loading ? '—' : Math.round(specialAvgPerHead).toLocaleString()}/คน · % = สัดส่วนของยอดเงินตรวจพิเศษ`}
          right={
            <div className="text-right">
              <span className="text-[13px] font-bold block tabular-nums" style={{ color: P.violet }}>฿{loading ? '—' : specialExamTotal.toLocaleString()}</span>
              <span className="text-[11px]" style={{ color: P.faint }}>{loading ? '—' : specialExamTotalCount.toLocaleString()} คน · {loading ? '—' : fmtPct(specialPct)} ของตรวจจริง</span>
            </div>
          } />
        {specialExamSummary.length === 0 && !loading ? (
          <p className="text-sm text-center py-4" style={{ color: P.faint }}>ไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <div className="space-y-2">
            {specialExamSummary.map((s, i) => {
              const share = specialExamTotal > 0 ? (s.amount / specialExamTotal) * 100 : 0
              return (
                <div key={i} className="rounded-lg px-3 py-2.5 border" style={{ borderColor: P.line, background: '#FCFCFE' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[13px] font-semibold" style={{ color: P.body }}>{s.name}</span>
                      <span className="text-[11px] ml-2 tabular-nums" style={{ color: P.faint }}>×{s.count}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: P.violetSoft, color: P.violet }}>{fmtPct(share)}</span>
                      <span className="text-[13px] font-bold tabular-nums" style={{ color: P.violet }}>฿{s.amount.toLocaleString()}</span>
                    </div>
                  </div>
                  <Bar pct={share} color={P.violet} className="mt-2" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    ),
  }

  const visibleOrder = order.filter(id => !hidden.includes(id))

  return (
    <div className="flex min-h-screen" style={{ background: P.bg }}>
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />
      <div className="flex-1 ml-56 p-6 overflow-auto">

        {/* ── HERO ── */}
        <div className="relative overflow-hidden rounded-2xl mb-4 p-6 shadow-[0_10px_30px_-12px_rgba(49,46,129,0.5)]"
          style={{ background: `linear-gradient(120deg, ${P.navy} 0%, ${P.primary} 55%, ${P.violet} 118%)` }}>
          <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">ภาพรวมธุรกิจ</h1>
              <p className="text-sm mt-1 text-white/70">
                ข้อมูลช่วง <span className="font-semibold text-white/90">{from || '—'}</span> ถึง <span className="font-semibold text-white/90">{to || '—'}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 p-2">
              <input type="month" value={filterMonth}
                onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo('') }}
                className="rounded-lg px-3 py-2 text-sm bg-white text-slate-700 border-0 focus:outline-none focus:ring-2 focus:ring-white/60" />
              <span className="text-white/50 text-xs">หรือ</span>
              <input type="date" value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setFilterMonth('') }}
                className="rounded-lg px-3 py-2 text-sm bg-white text-slate-700 border-0 focus:outline-none focus:ring-2 focus:ring-white/60" />
              <span className="text-white/50 text-xs">–</span>
              <input type="date" value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setFilterMonth('') }}
                className="rounded-lg px-3 py-2 text-sm bg-white text-slate-700 border-0 focus:outline-none focus:ring-2 focus:ring-white/60" />
              <button onClick={handleFilter}
                className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                <IconRefresh size={15}/> อัปเดต
              </button>
            </div>
          </div>

          {/* hero mini-stats */}
          <div className="relative mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {heroStats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">ยอดตรวจ{s.label}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white tabular-nums">{loading ? '—' : s.value.toLocaleString()}</span>
                  <span className="text-[11px] text-white/50">คน</span>
                </div>
                {!loading && <div className="mt-1"><TrendPill cur={s.cur} prev={s.prev} label={s.cmp} unit={s.unit} onDark /></div>}
                <p className="text-[11px] text-white/55 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* note */}
        <div className="rounded-lg px-3.5 py-2.5 mb-3 flex items-start gap-2 bg-indigo-50/60 border border-indigo-100">
          <IconInfoCircle size={15} className="text-indigo-500 flex-shrink-0 mt-0.5"/>
          <p className="text-xs text-indigo-900/80 leading-relaxed">
            ค่า &quot;เทียบกับ&quot; ทั้งหมด = เทียบช่วงเวลาเดียวกันก่อนหน้า (วันนี้↔เมื่อวาน · สัปดาห์นี้↔สัปดาห์ก่อน · เดือนนี้↔เดือนก่อน).
            ถ้าขึ้น <span className="font-semibold">&quot;ยังไม่มีข้อมูล&quot;</span> คือช่วงนั้นยังไม่มีการบันทึก ไม่ใช่ยอดตก
          </p>
        </div>

        {/* ── layout toolbar ── */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[11px]" style={{ color: P.faint }}>
            {editMode ? 'ลากการ์ดเพื่อสลับตำแหน่ง · กดไอคอนตาเพื่อซ่อน · จำเฉพาะเครื่องนี้ (ใช้บนคอม)' : ''}
          </p>
          <div className="flex items-center gap-2">
            {editMode && (
              <button onClick={resetLayout}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center gap-1.5">
                <IconRefresh size={13}/> รีเซ็ต
              </button>
            )}
            <button onClick={() => setEditMode(v => !v)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                editMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200'
              }`}>
              <IconLayoutGrid size={14}/> {editMode ? 'เสร็จสิ้น' : 'จัดเลย์เอาต์'}
            </button>
          </div>
        </div>

        {/* hidden widgets bar */}
        {editMode && hidden.length > 0 && (
          <div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-white p-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium" style={{ color: P.faint }}>ซ่อนอยู่:</span>
            {hidden.map(id => (
              <button key={id} onClick={() => showWidget(id)}
                className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition-colors">
                <IconEye size={12}/> {WIDGET_TITLES[id]}
              </button>
            ))}
          </div>
        )}

        {/* ── widget grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-start">
          {visibleOrder.map(id => (
            <section
              key={id}
              className={`${WIDGET_SPAN[id]} ${editMode ? 'rounded-xl ring-1 transition-shadow' : ''} ${
                editMode && dragOver === id ? 'ring-2 ring-indigo-500 shadow-lg' : editMode ? 'ring-indigo-200' : ''
              }`}
              draggable={editMode}
              onDragStart={() => { dragId.current = id }}
              onDragEnd={() => { dragId.current = null; setDragOver(null) }}
              onDragOver={e => { if (editMode) { e.preventDefault(); if (dragOver !== id) setDragOver(id) } }}
              onDrop={() => editMode && handleDrop(id)}
            >
              {editMode && (
                <div className="flex items-center justify-between px-1 pb-1.5 cursor-grab active:cursor-grabbing">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600">
                    <IconGripVertical size={14}/> {WIDGET_TITLES[id]}
                  </span>
                  <button onClick={() => hideWidget(id)} className="text-slate-400 hover:text-rose-500 transition-colors" title="ซ่อนการ์ดนี้">
                    <IconEyeOff size={14}/>
                  </button>
                </div>
              )}
              <div className={editMode ? 'pointer-events-none select-none' : ''}>
                {WIDGETS[id]}
              </div>
            </section>
          ))}
        </div>

      </div>
    </div>
  )
}
