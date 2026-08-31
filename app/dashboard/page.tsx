'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconRefresh, IconChevronRight, IconInfoCircle, IconMicroscope } from '@tabler/icons-react'

const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
const MONTHS_TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// ── โทนสีม่วง (ใช้ทั้งหน้า) ──
const P = {
  bg: '#F5F1F7',
  border: '#EADFEE',
  primary: '#8A5C9E',
  primaryDark: '#6B4A85',
  deep: '#766092',
  mid: '#A378B5',
  soft: '#C5A6C7',
  rose: '#D28BB5',
  pink: '#DEA6D5',
  light: '#E7D3EE',
  mauve: '#9F849B',
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
    repeatRate: 0,
    pendingPayments: 0, overdueCerts: 0, allPendingCerts: 0,
    revenue: 0, prevRevenue: 0,
    rangeTotal: 0, prevRangeTotal: 0,
    // 🔹 4 เสาหลักเพิ่มเติม
    rangeBooked: 0,
    rangeSim: 0,
    rangeSpecialWorkers: 0,
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
    let prevQuery = supabase.from('bookings').select('service_type, booked_count, medical_cases(actual_count), payments(amount_received)')
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

    const utilization = totalBooked > 0 ? Math.min(Math.round((totalActual/totalBooked)*100), 100) : 0
    const rangeTotal = totalActual
    const prevRangeTotal = prevData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0

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
      repeatRate,
      pendingPayments: pendingData?.length || 0,
      overdueCerts: totalOverdueCerts,
      allPendingCerts: totalAllPendingCerts,
      revenue, prevRevenue,
      rangeTotal, prevRangeTotal,
      rangeBooked: totalBooked,
      rangeSim: totalSim,
      rangeSpecialWorkers: totalSpecialWorkers,
    })
    setLoading(false)
  }

  const handleFilter = () => { setLoaded(false) }
  const { from, to } = getDateRange()

  type CompareResult = { text: string; color: string; arrow: 'up' | 'down' | null }
  const compareValues = (cur: number, prev: number, minBaseForPct = 5): CompareResult => {
    if (cur === 0 && prev === 0) return { text: 'ยังไม่มีข้อมูล', color: 'text-[#B9A7BF]', arrow: null }
    if (prev === 0) return { text: 'ไม่มีข้อมูลเทียบ', color: 'text-[#B9A7BF]', arrow: null }
    if (cur === 0) return { text: 'ยังไม่มีข้อมูลช่วงนี้', color: 'text-[#B9A7BF]', arrow: null }
    const diff = cur - prev
    const p = (diff / prev) * 100
    const up = p >= 0
    if (prev < minBaseForPct) {
      return { text: `${up ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(diff).toLocaleString()}`, color: up ? 'text-emerald-600' : 'text-rose-500', arrow: up ? 'up' : 'down' }
    }
    return { text: `${up ? '+' : '-'}${Math.abs(Math.round(p))}%`, color: up ? 'text-emerald-600' : 'text-rose-500', arrow: up ? 'up' : 'down' }
  }

  const Trend = ({ cur, prev, label }: { cur: number, prev: number, label?: string }) => {
    const r = compareValues(cur, prev)
    return (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${r.color}`}>
        {r.arrow === 'up' && <IconTrendingUp size={11}/>}
        {r.arrow === 'down' && <IconTrendingDown size={11}/>}
        {r.text} {label || ''}
      </span>
    )
  }

  // ── helpers ──
  const maxCust = (topCustomers[0]?.count as number) || 1
  const fmtPct = (n: number) => `${n > 0 && n < 10 ? n.toFixed(1) : Math.round(n)}%`
  const pctOfActual = (n: number) => (kpi.rangeTotal > 0 ? (n / kpi.rangeTotal) * 100 : 0)
  const specialPct = pctOfActual(kpi.rangeSpecialWorkers)
  const simPct = pctOfActual(kpi.rangeSim)
  const showUpRate = kpi.rangeBooked > 0 ? (kpi.rangeTotal / kpi.rangeBooked) * 100 : 0
  const simTotalCount = simSummary.reduce((s: number, x: any) => s + x.count, 0)
  const specialAvgPerHead = specialExamTotalCount > 0 ? specialExamTotal / specialExamTotalCount : 0

  // การ์ดพื้นฐาน + สีตามประเภทงาน
  const CARD = 'bg-white rounded-2xl border border-[#EADFEE] shadow-[0_1px_3px_rgba(118,96,146,0.07)]'
  const SvcColor: Record<string, string> = {
    'ตรวจนอกสถานที่ (Mobile)': P.primary,
    'คลินิก': P.rose,
    'Walk-in': P.mid,
    'ไฟล์ทบิน': P.deep,
  }
  const svcColor = (name: string) => SvcColor[name] || P.soft

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full" style={{ background: P.primary }} />
      <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.primary }}>{children}</p>
    </div>
  )

  const PctBar = ({ pct, color }: { pct: number, color?: string }) => (
    <div className="w-full rounded-full h-1.5 mt-2" style={{ background: '#F0E7F3' }}>
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color || P.primary }} />
    </div>
  )

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: P.bg, color: P.mauve }}>กำลังโหลด...</div>

  const inputCls = 'border border-[#E4D7E9] bg-white rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#A378B5]'

  return (
    <div className="flex min-h-screen" style={{ background: P.bg }}>
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />
      <div className="flex-1 ml-56 p-6 overflow-auto">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="inline-flex flex-col rounded-2xl px-5 py-3" style={{ background: P.deep }}>
            <p className="text-lg font-bold text-white leading-tight">ภาพรวมธุรกิจ</p>
            <p className="text-xs mt-0.5" style={{ color: '#E7D3EE' }}>ข้อมูลช่วง {from || '—'} ถึง {to || '—'}</p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-xl border border-[#EADFEE] px-3 py-2 shadow-sm">
            <input type="month" value={filterMonth}
              onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo('') }}
              className={inputCls} />
            <span className="text-[#B9A7BF] text-xs">หรือ</span>
            <input type="date" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setFilterMonth('') }}
              className={inputCls} />
            <span className="text-[#B9A7BF] text-xs">ถึง</span>
            <input type="date" value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setFilterMonth('') }}
              className={inputCls} />
            <button onClick={handleFilter}
              className="text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
              style={{ background: P.primary }}
              onMouseEnter={(e) => (e.currentTarget.style.background = P.primaryDark)}
              onMouseLeave={(e) => (e.currentTarget.style.background = P.primary)}>
              <IconRefresh size={14}/> กรอง
            </button>
          </div>
        </div>

        <div className="rounded-xl px-4 py-2.5 mb-4 flex items-start gap-2" style={{ background: '#F3EAF6', border: '1px solid #E7D3EE' }}>
          <IconInfoCircle size={16} style={{ color: P.primary }} className="flex-shrink-0 mt-0.5"/>
          <p className="text-xs" style={{ color: P.primaryDark }}>
            ตัวเลข &quot;เทียบกับ&quot; ด้านล่าง คือเทียบกับช่วงเวลาเดียวกันก่อนหน้า (วันนี้เทียบเมื่อวาน, สัปดาห์นี้เทียบสัปดาห์ก่อน, เดือนนี้เทียบเดือนก่อน)
            ถ้าขึ้นว่า <span className="font-semibold">&quot;ยังไม่มีข้อมูล&quot;</span> แปลว่าช่วงนั้นยังไม่มีการบันทึกจอง/ตรวจเข้ามา ไม่ใช่ยอดตก
          </p>
        </div>

        {/* 🔹 4 เสาหลัก */}
        <div className={`${CARD} p-5 mb-4`}>
          <SectionLabel>สรุปยอดตามช่วงที่เลือก · 4 เสาหลัก</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* 1. ยอดจอง */}
            <div className="rounded-xl p-4" style={{ background: '#FBF7FC', border: `1px solid ${P.border}` }}>
              <p className="text-xs font-semibold" style={{ color: P.mauve }}>1 · ยอดจองรวม (Booked)</p>
              <p className="text-3xl font-bold mt-1" style={{ color: P.deep }}>{loading ? '—' : kpi.rangeBooked.toLocaleString()}</p>
              <p className="text-xs mt-0.5" style={{ color: P.soft }}>คน (แผนจองในช่วงนี้)</p>
            </div>
            {/* 2. ยอดตรวจจริง */}
            <div className="rounded-xl p-4" style={{ background: P.primary }}>
              <p className="text-xs font-semibold text-white/80">2 · ยอดตรวจจริง (Actual)</p>
              <p className="text-3xl font-bold mt-1 text-white">{loading ? '—' : kpi.rangeTotal.toLocaleString()}</p>
              <span className="text-xs text-white/75">= {loading ? '—' : fmtPct(showUpRate)} ของยอดจอง</span>
              <div className="mt-1"><Trend cur={kpi.rangeTotal} prev={kpi.prevRangeTotal} label="เทียบช่วงก่อน"/></div>
            </div>
            {/* 3. ตรวจพิเศษ */}
            <div className="rounded-xl p-4" style={{ background: '#FBF7FC', border: `1px solid ${P.border}` }}>
              <p className="text-xs font-semibold flex items-center gap-1" style={{ color: P.mauve }}><IconMicroscope size={13}/> 3 · ยอดตรวจพิเศษ (Special)</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-3xl font-bold" style={{ color: P.rose }}>{loading ? '—' : kpi.rangeSpecialWorkers.toLocaleString()}</p>
                <span className="text-sm font-bold px-2 py-0.5 rounded-full" style={{ background: '#F7E9F1', color: P.rose }}>
                  {loading ? '—' : fmtPct(specialPct)}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: P.soft }}>คน · คิดเป็น {loading ? '—' : fmtPct(specialPct)} ของยอดตรวจจริง</p>
              <PctBar pct={specialPct} color={P.rose} />
            </div>
            {/* 4. ซิม */}
            <div className="rounded-xl p-4" style={{ background: '#FBF7FC', border: `1px solid ${P.border}` }}>
              <p className="text-xs font-semibold" style={{ color: P.mauve }}>4 · ยอดขายซิม (Sim)</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-3xl font-bold" style={{ color: P.mid }}>{loading ? '—' : kpi.rangeSim.toLocaleString()}</p>
                <span className="text-sm font-bold px-2 py-0.5 rounded-full" style={{ background: '#F0E7F3', color: P.mid }}>
                  {loading ? '—' : fmtPct(simPct)}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: P.soft }}>ซิม · คิดเป็น {loading ? '—' : fmtPct(simPct)} ของยอดตรวจจริง</p>
              <PctBar pct={simPct} color={P.mid} />
            </div>
          </div>
        </div>

        {/* DTD / WTD / MTD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'ยอดตรวจวันนี้', sub: 'นับเฉพาะวันนี้วันเดียว', val: kpi.dtd, cur: kpi.dtd, prev: kpi.dtdPrev, foot: `เทียบเมื่อวาน (${kpi.dtdPrev.toLocaleString()} คน)`, avg: null as string | null },
            { label: 'ยอดตรวจสัปดาห์นี้', sub: 'นับตั้งแต่วันจันทร์ถึงวันนี้', val: kpi.wtd, cur: kpi.wtdAvg, prev: kpi.wtdPrevAvg, foot: `เทียบสัปดาห์ก่อน (เฉลี่ย ${kpi.wtdPrevAvg.toFixed(1)}/วัน)`, avg: `เฉลี่ยวันละ ${kpi.wtdAvg.toFixed(1)}` },
            { label: 'ยอดตรวจเดือนนี้', sub: 'นับตั้งแต่วันที่ 1 ถึงวันนี้', val: kpi.mtd, cur: kpi.mtdAvg, prev: kpi.mtdPrevAvg, foot: `เทียบเดือนก่อน (เฉลี่ย ${kpi.mtdPrevAvg.toFixed(1)}/วัน)`, avg: `เฉลี่ยวันละ ${kpi.mtdAvg.toFixed(1)}` },
          ].map((c) => (
            <div key={c.label} className={`${CARD} p-5`}>
              <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: P.primary }}>{c.label}</p>
              <p className="text-xs mt-0.5" style={{ color: P.soft }}>{c.sub}</p>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-4xl font-bold" style={{ color: P.deep }}>{loading ? '—' : c.val.toLocaleString()}</p>
                  <p className="text-xs mt-1" style={{ color: P.mauve }}>คน{c.avg ? ` · ${loading ? '—' : c.avg}` : ''}</p>
                </div>
                <div className="text-right">
                  <Trend cur={c.cur} prev={c.prev}/>
                  <p className="text-xs mt-0.5" style={{ color: P.soft }}>{c.foot}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* KPI รอง */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className={`${CARD} p-4`} style={{ borderLeft: `4px solid ${P.primary}` }}>
            <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: P.primary }}>อัตรามาตรวจจริง</p>
            <p className="text-3xl font-bold mt-1" style={{ color: P.deep }}>{loading ? '—' : `${kpi.utilization}%`}</p>
            <PctBar pct={kpi.utilization} />
            <p className="text-xs mt-1" style={{ color: P.mauve }}>คนที่มาตรวจจริง ÷ คนที่จองไว้</p>
          </div>
          <div className={`${CARD} p-4 cursor-pointer`} style={{ borderLeft: `4px solid ${P.rose}` }} onClick={() => window.location.href='/payments'}>
            <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: P.primary }}>รับเงินช่วงนี้</p>
            <p className="text-2xl font-bold mt-1" style={{ color: P.rose }}>฿{loading ? '—' : kpi.revenue.toLocaleString()}</p>
            <Trend cur={kpi.revenue} prev={kpi.prevRevenue} label="เทียบช่วงก่อน"/>
          </div>
          <div className={`${CARD} p-4`} style={{ borderLeft: `4px solid ${P.mid}` }}>
            <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: P.primary }}>ลูกค้าที่ใช้บริการ</p>
            <p className="text-3xl font-bold mt-1" style={{ color: P.deep }}>{loading ? '—' : kpi.activeCustomers.toLocaleString()}</p>
            <p className="text-xs mt-1" style={{ color: P.mauve }}>
              {kpi.totalCustomers > 0 ? `${fmtPct((kpi.activeCustomers / kpi.totalCustomers) * 100)} ` : ''}
              จากลูกค้าทั้งหมด {kpi.totalCustomers.toLocaleString()} ราย
            </p>
          </div>
          <div className={`${CARD} p-4`} style={{ borderLeft: `4px solid ${P.deep}` }}>
            <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: P.primary }}>ลูกค้ากลับมาซ้ำ</p>
            <p className="text-3xl font-bold mt-1" style={{ color: P.deep }}>{loading ? '—' : `${kpi.repeatRate}%`}</p>
            <PctBar pct={kpi.repeatRate} color={P.deep} />
            <p className="text-xs mt-1" style={{ color: P.mauve }}>ของลูกค้าที่ใช้บริการช่วงนี้</p>
          </div>
        </div>

        {/* แนวโน้มรายเดือน + แยกตามประเภทงาน */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className={`${CARD} p-5`}>
            <SectionLabel>แนวโน้มรายเดือน</SectionLabel>
            <p className="text-xs mb-5" style={{ color: P.soft }}>จำนวนคนตรวจ และรายได้ ย้อนหลัง 6 เดือน (ไม่ขึ้นกับตัวกรองด้านบน)</p>
            <div className="flex items-end gap-3 h-40">
              {monthlyTrend.map((m, i) => {
                const maxCount = Math.max(...monthlyTrend.map(x => x.count), 1)
                const isCurrent = i === monthlyTrend.length - 1
                const barPct = Math.round((m.count/maxCount)*100)
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold" style={{ color: P.deep }}>{m.count > 0 ? m.count.toLocaleString() : ''}</span>
                    <div className="w-full flex items-end" style={{ height: '96px' }}>
                      <div className="w-full rounded-t-lg transition-all duration-500" style={{
                        height: `${barPct}%`,
                        minHeight: m.count > 0 ? '6px' : '2px',
                        background: isCurrent ? P.primary : P.light
                      }}/>
                    </div>
                    <span className="text-xs mt-1" style={{ color: isCurrent ? P.primary : P.mauve, fontWeight: isCurrent ? 700 : 400 }}>{m.label}</span>
                    <span className="text-xs font-medium" style={{ color: P.rose }}>฿{m.revenue >= 1000 ? `${Math.round(m.revenue/1000)}k` : m.revenue}</span>
                  </div>
                )
              })}
              {monthlyTrend.length === 0 && !loading && <p className="text-sm text-center w-full" style={{ color: P.mauve }}>ไม่มีข้อมูล</p>}
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <SectionLabel>แยกตามประเภทงาน</SectionLabel>
            <p className="text-xs mb-4" style={{ color: P.soft }}>ตัวเลข = จำนวนคน · แถบ = สัดส่วนเทียบยอดตรวจจริงทั้งหมด · เทียบช่วงก่อนหน้า</p>
            <div className="space-y-3">
              {serviceBreakdown.length === 0 && !loading && <p className="text-sm text-center py-4" style={{ color: P.mauve }}>ไม่มีข้อมูล</p>}
              {serviceBreakdown.map(s => {
                const prev = prevServiceBreakdown.find(p => p.name === s.name)?.count || 0
                const r = compareValues(s.count, prev)
                const share = kpi.rangeTotal > 0 ? (s.count / kpi.rangeTotal) * 100 : 0
                const color = svcColor(s.name)
                return (
                  <div key={s.name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#F0E7F3', color: P.deep }}>{fmtPct(share)}</span>
                        <span className="text-sm font-bold text-gray-800">{s.count.toLocaleString()}</span>
                        <span className={`text-xs font-semibold ${r.color}`}>{r.text}</span>
                      </div>
                    </div>
                    <div className="w-full rounded-full h-1.5" style={{ background: '#F0E7F3' }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${share}%`, background: color }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-[#EADFEE] grid grid-cols-2 gap-2">
              <div className="rounded-xl p-3 cursor-pointer" style={{ background: '#FDECEF', border: '1px solid #F8D3DA' }} onClick={() => window.location.href='/payments'}>
                <p className="text-xs font-semibold mb-0.5 text-rose-500">รอเก็บเงิน</p>
                <p className="text-2xl font-bold text-rose-500">{kpi.pendingPayments}</p>
                <p className="text-xs text-rose-400">รายการ (ยังไม่ชำระ/ค้างชำระ)</p>
              </div>
              <div className="rounded-xl p-3 cursor-pointer" style={{ background: '#FDF3E7', border: '1px solid #F5E1C4' }} onClick={() => window.location.href='/medical'}>
                <p className="text-xs font-semibold mb-0.5 text-amber-600">รอส่งใบแพทย์ (ทั้งหมด)</p>
                <p className="text-2xl font-bold text-amber-500">{kpi.allPendingCerts.toLocaleString()}</p>
                <p className="text-xs text-amber-500/80">ใบ ที่ยังไม่ได้ส่งให้ลูกค้า{kpi.overdueCerts > 0 ? ` (เกินกำหนด ${kpi.overdueCerts.toLocaleString()} ใบ)` : ''}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Top Customers / Aging Certs / Inactive */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${CARD} p-5`}>
            <div className="flex justify-between items-center">
              <SectionLabel>ลูกค้าที่ใช้บริการเยอะสุด</SectionLabel>
              <span className="text-xs font-semibold mb-3" style={{ color: P.primary }}>{topCustomers.length} ราย</span>
            </div>
            <p className="text-xs mb-3" style={{ color: P.soft }}>เรียงตามจำนวนคนที่มาตรวจ · % = สัดส่วนของยอดตรวจจริงทั้งหมด</p>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {topCustomers.length === 0 && !loading && <p className="text-sm text-center py-4" style={{ color: P.mauve }}>ไม่มีข้อมูล</p>}
              {topCustomers.map((c, i) => {
                const share = kpi.rangeTotal > 0 ? (c.count / kpi.rangeTotal) * 100 : 0
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-xs w-4 text-right font-mono" style={{ color: P.soft }}>{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs text-gray-700 truncate">{c.name}</span>
                        <span className="text-xs ml-2 flex-shrink-0" style={{ color: P.deep }}>
                          <span className="font-bold text-gray-800">{c.count.toLocaleString()}</span> · {fmtPct(share)}
                        </span>
                      </div>
                      <div className="w-full rounded-full h-1.5" style={{ background: '#F0E7F3' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.round((c.count/maxCust)*100)}%`, background: P.primary }}/>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ใบแพทย์ค้างส่ง */}
          <div className={`${CARD} p-5`}>
            <div className="flex justify-between items-center flex-wrap gap-1">
              <SectionLabel>ใบแพทย์ค้างส่ง</SectionLabel>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs bg-rose-50 text-rose-500 font-semibold px-2 py-0.5 rounded-full">เกินกำหนด {kpi.overdueCerts.toLocaleString()} ใบ</span>
                <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-2 py-0.5 rounded-full">รอส่งทั้งหมด {kpi.allPendingCerts.toLocaleString()} ใบ</span>
              </div>
            </div>
            <p className="text-xs mb-3" style={{ color: P.soft }}>
              สีแดง = เกินกำหนดแล้ว (ปกติเกิน 3 วัน / ตรวจพิเศษเกิน 14 วัน) · สีเหลือง = ยังไม่เกินกำหนดแต่ยังส่งไม่ครบ
            </p>
            <div className="space-y-2">
              {agingCerts.length === 0 && !loading && (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-sm text-emerald-600 font-medium">ไม่มีใบแพทย์ค้างส่งเลย</p>
                  <p className="text-xs text-emerald-500 mt-1">ทุกเคสส่งใบแพทย์ครบแล้ว</p>
                </div>
              )}
              {agingCerts.map((c, i) => (
                <div key={i} className={`flex items-center justify-between p-2.5 rounded-xl border ${c.isOverdue ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium text-gray-700 truncate">{c.customer_name}</p>
                      {c.hasSpecialExam && (
                        <span className="text-[9px] font-medium px-1 rounded flex-shrink-0" style={{ background: '#F3EAF6', color: P.primary }}>ตรวจพิเศษ</span>
                      )}
                      {!c.isOverdue && (
                        <span className="text-[9px] bg-gray-100 text-gray-500 font-medium px-1 rounded flex-shrink-0">ยังไม่เกินกำหนด</span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: P.soft }}>{c.case_number} · {c.booking_date}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={`text-xs font-bold ${c.isOverdue ? 'text-rose-500' : 'text-amber-600'}`}>ค้าง {c.pending} ใบ</p>
                    <span className={`text-xs flex items-center gap-0.5 justify-end ${c.isOverdue ? 'text-rose-400' : 'text-amber-500'}`}>
                      <IconAlertTriangle size={9}/> {c.daysOver} วันที่แล้ว
                    </span>
                  </div>
                </div>
              ))}
              {agingCerts.length > 0 && (
                <button onClick={() => window.location.href='/medical'} className="w-full text-xs flex items-center justify-center gap-1 pt-1 transition-colors" style={{ color: P.mauve }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = P.primary)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = P.mauve)}>
                  ดูทั้งหมด <IconChevronRight size={12}/>
                </button>
              )}
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <SectionLabel>ลูกค้าที่หายไปนาน</SectionLabel>
            <p className="text-xs mb-3" style={{ color: P.soft }}>ไม่มาใช้บริการเกิน 90 วัน</p>
            <div className="mb-3">
              <p className="text-xs font-bold mb-2" style={{ color: P.primary }}>กลุ่มไฟล์ทบิน / MOU</p>
              <div className="space-y-1.5">
                {inactiveCustomers.mou.length === 0 && <p className="text-xs" style={{ color: P.mauve }}>ไม่มี</p>}
                {inactiveCustomers.mou.map(c => (
                  <div key={c.name} className="flex items-center justify-between py-1 border-b border-[#F2EAF4]">
                    <span className="text-xs text-gray-700 truncate flex-1">{c.name}</span>
                    <span className="text-xs ml-2 flex-shrink-0" style={{ color: P.soft }}>หายไป {c.daysAgo} วัน</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-[#EADFEE] pt-3">
              <p className="text-xs font-bold mb-2 text-amber-600">กลุ่มอื่นๆ (ควรติดต่อชวนกลับมา)</p>
              <div className="space-y-1.5">
                {inactiveCustomers.renew.length === 0 && <p className="text-xs" style={{ color: P.mauve }}>ไม่มี</p>}
                {inactiveCustomers.renew.map(c => (
                  <div key={c.name} className="flex items-center justify-between py-1 border-b border-[#F2EAF4]">
                    <span className="text-xs text-gray-700 truncate flex-1">{c.name}</span>
                    <span className="text-xs ml-2 flex-shrink-0" style={{ color: P.soft }}>หายไป {c.daysAgo} วัน</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ยอดหนี้ค้างชำระ */}
        <div className={`${CARD} p-5 mt-4`}>
          <div className="flex justify-between items-center">
            <SectionLabel>ยอดหนี้ค้างชำระทั้งหมด</SectionLabel>
            <span className="text-xl font-bold text-rose-500 mb-3">฿{loading ? '—' : totalDebt.toLocaleString()}</span>
          </div>
          <p className="text-xs mb-4" style={{ color: P.soft }}>รวมยอดยกมาก่อนใช้ระบบด้วย · % = สัดส่วนของหนี้ทั้งหมด</p>
          {debtByService.length === 0 && !loading ? (
            <p className="text-sm text-center py-4" style={{ color: P.mauve }}>ไม่มียอดค้างชำระ</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {debtByService.map(d => {
                const isOpening = d.name === 'ยอดยกมา (ก่อนใช้ระบบ)'
                const color = isOpening ? '#D97706' : svcColor(d.name)
                const share = totalDebt > 0 ? (d.amount / totalDebt) * 100 : 0
                return (
                  <div key={d.name} className={`rounded-xl p-3 cursor-pointer border ${isOpening ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`} onClick={() => window.location.href='/customers'}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: color }}/>
                      <p className="text-xs text-gray-600 truncate">{d.name}</p>
                    </div>
                    <p className={`text-base font-bold ${isOpening ? 'text-amber-600' : 'text-rose-500'}`}>฿{d.amount.toLocaleString()}</p>
                    <p className="text-xs mt-0.5" style={{ color: P.soft }}>{fmtPct(share)} ของหนี้ทั้งหมด</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ยอดขายซิม + ยอดตรวจพิเศษย่อย */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className={`${CARD} p-5`}>
            <div className="flex justify-between items-start">
              <SectionLabel>ยอดขายซิมตามแพ็กเกจ</SectionLabel>
              <div className="text-right">
                <span className="text-sm font-bold block" style={{ color: P.mid }}>{loading ? '—' : simTotalCount.toLocaleString()} ซิม</span>
                <span className="text-xs" style={{ color: P.soft }}>{loading ? '—' : fmtPct(simPct)} ของยอดตรวจจริง</span>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: P.soft }}>ตามช่วงที่กรอง · % = สัดส่วนของซิมทั้งหมด</p>
            {simSummary.length === 0 && !loading ? (
              <p className="text-sm text-center py-4" style={{ color: P.mauve }}>ไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              <div className="space-y-2">
                {simSummary.map((s, i) => {
                  const isLegacy = s.package === 'ไม่ระบุแพ็คเกจ (ข้อมูลเก่า)'
                  const share = simTotalCount > 0 ? (s.count / simTotalCount) * 100 : 0
                  return (
                    <div key={i} className={`flex justify-between items-center rounded-lg px-3 py-2 border ${isLegacy ? 'bg-gray-50 border-gray-200' : ''}`}
                      style={isLegacy ? {} : { background: '#FBF7FC', borderColor: P.border }}>
                      <div>
                        <span className={`text-sm font-medium ${isLegacy ? 'text-gray-500' : 'text-gray-700'}`}>
                          {isLegacy ? s.package : `฿${s.package}/เดือน`}
                        </span>
                        <span className="text-xs ml-2" style={{ color: P.soft }}>{s.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#F0E7F3', color: P.deep }}>{fmtPct(share)}</span>
                        <span className="text-sm font-bold" style={{ color: isLegacy ? '#6B7280' : P.mid }}>{s.count} ซิม</span>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between items-center pt-2 border-t border-[#EADFEE]">
                  <span className="text-xs font-semibold" style={{ color: P.mauve }}>รวมทั้งหมด</span>
                  <span className="text-sm font-bold" style={{ color: P.deep }}>{simTotalCount} ซิม</span>
                </div>
              </div>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <div className="flex justify-between items-start">
              <SectionLabel>ยอดตรวจพิเศษ</SectionLabel>
              <div className="text-right">
                <span className="text-sm font-bold block" style={{ color: P.rose }}>฿{loading ? '—' : specialExamTotal.toLocaleString()}</span>
                <span className="text-xs" style={{ color: P.soft }}>{loading ? '—' : specialExamTotalCount.toLocaleString()} คน/ครั้ง · {loading ? '—' : fmtPct(specialPct)} ของยอดตรวจจริง</span>
              </div>
            </div>
            <p className="text-xs mb-3" style={{ color: P.soft }}>
              ตามช่วงที่กรอง · เฉลี่ย ฿{loading ? '—' : Math.round(specialAvgPerHead).toLocaleString()}/คน · % = สัดส่วนของยอดตรวจพิเศษทั้งหมด
            </p>
            {specialExamSummary.length === 0 && !loading ? (
              <p className="text-sm text-center py-4" style={{ color: P.mauve }}>ไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              <div className="space-y-2">
                {specialExamSummary.map((s, i) => {
                  const share = specialExamTotal > 0 ? (s.amount / specialExamTotal) * 100 : 0
                  return (
                    <div key={i} className="rounded-lg px-3 py-2 border" style={{ background: '#FBF7FC', borderColor: P.border }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-sm font-medium text-gray-700">{s.name}</span>
                          <span className="text-xs ml-2" style={{ color: P.soft }}>×{s.count}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#F7E9F1', color: P.rose }}>{fmtPct(share)}</span>
                          <span className="text-sm font-bold" style={{ color: P.rose }}>฿{s.amount.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="w-full rounded-full h-1.5 mt-1.5" style={{ background: '#F0E7F3' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${share}%`, background: P.rose }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
