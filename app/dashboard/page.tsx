'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconRefresh, IconChevronRight, IconInfoCircle, IconMicroscope, IconCheck } from '@tabler/icons-react'

const MONTHS_TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

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
    pendingPayments: 0, overdueCerts: 0,
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

    // Range Bookings Data
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

    // Metrics คำนวณ 4 เสาหลัก
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

    // Peak days & Service breakdown & Top customers
    const days = [0,0,0,0,0,0,0]
    rangeData?.forEach(b => { const d = new Date(b.booking_date).getDay(); days[d] += (getMc(b)?.actual_count || b.booked_count || 0) })
    setPeakDays(days)

    const services: any = {}, prevServices: any = {}
    rangeData?.forEach(b => { const s = b.service_type || 'ไม่ระบุ'; services[s] = (services[s]||0) + (getMc(b)?.actual_count || b.booked_count || 0) })
    prevData?.forEach(b => { const s = b.service_type || 'ไม่ระบุ'; prevServices[s] = (prevServices[s]||0) + (getMc(b)?.actual_count || b.booked_count || 0) })
    setServiceBreakdown(Object.entries(services).sort((a:any,b:any) => b[1]-a[1]).map(([k,v]) => ({ name: k, count: v as number })))
    setPrevServiceBreakdown(Object.entries(prevServices).map(([k,v]) => ({ name: k, count: v as number })))

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

    // 🔹 Aging certs (ปรับแก้เพื่อขจัด False Alarm)
    let allYearMedical: any[] = []
    let agingFrom = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('case_number, booking_date, booked_count, customers(customer_name), medical_cases(actual_count, cert_count, cert_status), special_exams(id)')
        .gte('booking_date', '2026-01-01')
        .lte('booking_date', todayStr)
        .range(agingFrom, agingFrom + 999)
      if (!chunk || chunk.length === 0) break
      allYearMedical = [...allYearMedical, ...chunk]
      if (chunk.length < 1000) break
      agingFrom += 1000
    }

    const agingList = (allYearMedical || [])
      .map(b => {
        const mc = getMc(b)
        const actual = mc?.actual_count || 0
        const certSent = mc?.cert_count || 0
        const pending = Math.max(actual - certSent, 0)
        const daysOver = Math.floor((today.getTime() - new Date(b.booking_date).getTime()) / 86400000)
        
        // 🔹 เช็คตรวจพิเศษเพื่อขยายเวลา Deadline เป็น 14 วัน
        const hasSpecialExam = (b.special_exams && b.special_exams.length > 0)
        const allowedDays = hasSpecialExam ? 14 : 3
        const isOverdue = daysOver > allowedDays && pending > 0

        return {
          case_number: b.case_number,
          customer_name: (b.customers as any)?.customer_name,
          booking_date: b.booking_date,
          pending,
          daysOver,
          hasSpecialExam,
          isOverdue,
          cert_status: mc?.cert_status || 'รอบันทึก'
        }
      })
      .filter(b => b.pending > 0 && b.isOverdue && b.cert_status !== 'เรียบร้อย')
      .sort((a, b) => b.pending - a.pending)

    const totalPendingCerts = agingList.reduce((s, b) => s + b.pending, 0)
    setAgingCerts(agingList.slice(0, 5))

    // ยอดหนี้ค้าง
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

    // สรุปยอดซิม
    let allSimItems: any[] = []
    let simFrom = 0
    while (true) {
      const { data: chunk } = await supabase.from('sim_items').select('booking_id, sim_package, sim_type, sim_count, bookings(booking_date)').range(simFrom, simFrom + 999)
      if (!chunk || chunk.length === 0) break
      allSimItems = [...allSimItems, ...chunk]
      if (chunk.length < 1000) break
      simFrom += 1000
    }
    const simInRange = allSimItems.filter((s: any) => {
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
      overdueCerts: totalPendingCerts,
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
    if (cur === 0 && prev === 0) return { text: 'ยังไม่มีข้อมูล', color: 'text-gray-400', arrow: null }
    if (prev === 0) return { text: 'ไม่มีข้อมูลเทียบ', color: 'text-gray-400', arrow: null }
    if (cur === 0) return { text: 'ยังไม่มีข้อมูลช่วงนี้', color: 'text-gray-400', arrow: null }
    const diff = cur - prev
    const p = (diff / prev) * 100
    const up = p >= 0
    if (prev < minBaseForPct) {
      return { text: `${up ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(diff).toLocaleString()}`, color: up ? 'text-emerald-600' : 'text-red-500', arrow: up ? 'up' : 'down' }
    }
    return { text: `${up ? '+' : '-'}${Math.abs(Math.round(p))}%`, color: up ? 'text-emerald-600' : 'text-red-500', arrow: up ? 'up' : 'down' }
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

  const maxCust = (topCustomers[0]?.count as number) || 1

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />
      <div className="flex-1 ml-56 p-6 overflow-auto">

        <div className="flex justify-between items-center mb-5">
          <div>
            <p className="text-base font-semibold text-gray-800">ภาพรวมธุรกิจ</p>
            <p className="text-xs text-gray-400 mt-0.5">แสดงข้อมูลช่วง {from} — {to}</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={filterMonth}
              onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo('') }}
              className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            <span className="text-gray-400 text-xs">หรือ</span>
            <input type="date" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setFilterMonth('') }}
              className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            <span className="text-gray-400 text-xs">ถึง</span>
            <input type="date" value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setFilterMonth('') }}
              className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            <button onClick={handleFilter}
              className="bg-[#185FA5] hover:bg-[#0C447C] text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
              <IconRefresh size={14}/> กรอง
            </button>
          </div>
        </div>

        {/* 🔹 4 เสาหลัก KPI Banner */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">📌 สรุปยอดตามช่วงที่เลือก (4 เสาหลัก)</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
              <p className="text-xs text-blue-600 font-medium">1. ยอดจองรวม (Booked)</p>
              <p className="text-2xl font-bold text-[#185FA5] mt-1">{loading ? '—' : kpi.rangeBooked.toLocaleString()}</p>
              <p className="text-xs text-blue-400 mt-0.5">คน</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
              <p className="text-xs text-emerald-600 font-medium">2. ยอดตรวจจริง (Actual)</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{loading ? '—' : kpi.rangeTotal.toLocaleString()}</p>
              <Trend cur={kpi.rangeTotal} prev={kpi.prevRangeTotal} label="เทียบช่วงก่อน"/>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3.5">
              <p className="text-xs text-purple-600 font-medium flex items-center gap-1"><IconMicroscope size={13}/> 3. ยอดตรวจพิเศษ (Special)</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{loading ? '—' : kpi.rangeSpecialWorkers.toLocaleString()}</p>
              <p className="text-xs text-purple-400 mt-0.5">คน (ตรวจเพิ่มเติม/Lab)</p>
            </div>
            <div className="bg-sky-50 border border-sky-100 rounded-xl p-3.5">
              <p className="text-xs text-sky-600 font-medium">4. ยอดขายซิม (Sim)</p>
              <p className="text-2xl font-bold text-sky-600 mt-1">{loading ? '—' : kpi.rangeSim.toLocaleString()}</p>
              <p className="text-xs text-sky-400 mt-0.5">ซิม</p>
            </div>
          </div>
        </div>

        {/* 3 กล่องย่อย DTD / WTD / MTD */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">ยอดตรวจวันนี้</p>
            <p className="text-xs text-gray-300 mb-3">นับเฉพาะวันนี้วันเดียว</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-800">{loading ? '—' : kpi.dtd.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">คน</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.dtd} prev={kpi.dtdPrev}/>
                <p className="text-xs text-gray-400 mt-0.5">เทียบเมื่อวาน ({kpi.dtdPrev} คน)</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">ยอดตรวจสัปดาห์นี้</p>
            <p className="text-xs text-gray-300 mb-3">นับตั้งแต่วันจันทร์ถึงวันนี้</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-800">{loading ? '—' : kpi.wtd.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">คน · เฉลี่ยวันละ {loading ? '—' : kpi.wtdAvg.toFixed(1)}</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.wtdAvg} prev={kpi.wtdPrevAvg}/>
                <p className="text-xs text-gray-400 mt-0.5">เทียบสัปดาห์ก่อน ({kpi.wtdPrevAvg.toFixed(1)}/วัน)</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">ยอดตรวจเดือนนี้</p>
            <p className="text-xs text-gray-300 mb-3">นับตั้งแต่วันที่ 1 ถึงวันนี้</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-800">{loading ? '—' : kpi.mtd.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">คน · เฉลี่ยวันละ {loading ? '—' : kpi.mtdAvg.toFixed(1)}</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.mtdAvg} prev={kpi.mtdPrevAvg}/>
                <p className="text-xs text-gray-400 mt-0.5">เทียบเดือนก่อน ({kpi.mtdPrevAvg.toFixed(1)}/วัน)</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">อัตรามาตรวจจริง</p>
            <p className="text-3xl font-bold text-[#185FA5]">{loading ? '—' : `${kpi.utilization}%`}</p>
            <div className="mt-2 bg-gray-100 rounded-full h-1.5">
              <div className="bg-[#185FA5] h-1.5 rounded-full transition-all" style={{ width: `${kpi.utilization}%` }}/>
            </div>
          </div>
          <div className="bg-white border-l-4 border-l-emerald-500 border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer" onClick={() => window.location.href='/payments'}>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">รับเงินช่วงนี้</p>
            <p className="text-3xl font-bold text-emerald-600">฿{loading ? '—' : kpi.revenue.toLocaleString()}</p>
            <Trend cur={kpi.revenue} prev={kpi.prevRevenue} label="เทียบช่วงก่อน"/>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ลูกค้าที่ใช้บริการ</p>
            <p className="text-3xl font-bold text-gray-800">{loading ? '—' : kpi.activeCustomers}</p>
            <p className="text-xs text-gray-400 mt-1">จากลูกค้าทั้งหมด {kpi.totalCustomers} ราย</p>
          </div>
          <div className="bg-white border-l-4 border-l-purple-500 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ลูกค้ากลับมาซ้ำ</p>
            <p className="text-3xl font-bold text-purple-600">{loading ? '—' : `${kpi.repeatRate}%`}</p>
          </div>
        </div>

        {/* 📊 แนวโน้ม + ประเภทงาน */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">📊 แนวโน้มรายเดือน</p>
            <p className="text-xs text-gray-300 mb-5">คนตรวจ และรายได้ ย้อนหลัง 6 เดือน</p>
            <div className="flex items-end gap-3 h-40">
              {monthlyTrend.map((m, i) => {
                const maxCount = Math.max(...monthlyTrend.map(x => x.count), 1)
                const isCurrent = i === monthlyTrend.length - 1
                const barPct = Math.round((m.count/maxCount)*100)
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-gray-700">{m.count > 0 ? m.count.toLocaleString() : ''}</span>
                    <div className="w-full flex items-end" style={{ height: '96px' }}>
                      <div className="w-full rounded-t-lg transition-all duration-500" style={{
                        height: `${barPct}%`,
                        minHeight: m.count > 0 ? '6px' : '2px',
                        background: isCurrent ? '#185FA5' : '#BFDBFE'
                      }}/>
                    </div>
                    <span className={`text-xs mt-1 ${isCurrent ? 'text-[#185FA5] font-bold' : 'text-gray-400'}`}>{m.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">📋 แยกตามประเภทงาน</p>
            <p className="text-xs text-gray-300 mb-4">เทียบกับช่วงก่อนหน้า</p>
            <div className="space-y-3">
              {serviceBreakdown.map(s => {
                const prev = prevServiceBreakdown.find(p => p.name === s.name)?.count || 0
                const r = compareValues(s.count, prev)
                const colors: any = { 'ตรวจนอกสถานที่ (Mobile)': '#185FA5', 'คลินิก': '#7C3AED', 'Walk-in': '#059669', 'ไฟล์ทบิน': '#0EA5E9' }
                return (
                  <div key={s.name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{s.count.toLocaleString()}</span>
                        <span className={`text-xs font-semibold ${r.color}`}>{r.text}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.round((s.count/(serviceBreakdown[0]?.count||1))*100)}%`, background: colors[s.name]||'#94A3B8' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 🔹 ตารางใบแพทย์ค้างส่ง (ปรับปรุงแล้ว - ปราศจาก False Alarm) */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm col-span-2">
            <div className="flex justify-between items-center mb-1">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">⚠️ ใบแพทย์ค้างส่งเกินกำหนด</p>
              <span className="text-xs bg-red-50 text-red-500 font-semibold px-2.5 py-1 rounded-full">
                ค้างส่งจริง {kpi.overdueCerts.toLocaleString()} ใบ
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              (เคสปกติเกิน 3 วัน / เคสตรวจพิเศษรอผล Lab เกิน 14 วัน)
            </p>
            <div className="space-y-2">
              {agingCerts.length === 0 && !loading && (
                <div className="text-center py-8 bg-emerald-50/50 rounded-xl border border-emerald-100">
                  <p className="text-3xl mb-1">✅</p>
                  <p className="text-sm text-emerald-600 font-semibold">ไม่มีใบแพทย์ค้างส่งเกินกำหนด</p>
                  <p className="text-xs text-emerald-500 mt-0.5">เคสตรวจพิเศษรอผล Lab ยังอยู่ในกรอบเวลา 14 วันทำการ</p>
                </div>
              )}
              {agingCerts.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red-50/80 border border-red-100 rounded-xl">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-gray-800 truncate">{c.customer_name}</p>
                      {c.hasSpecialExam && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 font-medium px-1.5 py-0.5 rounded">
                          ตรวจพิเศษ (Lab)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{c.case_number} · วันที่ตรวจ {c.booking_date}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs font-bold text-red-600">ค้าง {c.pending} ใบ</p>
                    <span className="text-xs text-red-500 flex items-center gap-0.5 justify-end mt-0.5">
                      <IconAlertTriangle size={11}/> ผ่านมาแล้ว {c.daysOver} วัน
                    </span>
                  </div>
                </div>
              ))}
              {agingCerts.length > 0 && (
                <button onClick={() => window.location.href='/medical'} className="w-full text-xs text-gray-400 hover:text-[#185FA5] flex items-center justify-center gap-1 pt-2 transition-colors">
                  ดูทั้งหมดในเวชระเบียน <IconChevronRight size={12}/>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">💤 ลูกค้าที่หายไปนาน</p>
            <p className="text-xs text-gray-300 mb-3">ไม่มาใช้บริการเกิน 90 วัน</p>
            <div className="space-y-1.5">
              {inactiveCustomers.renew.map(c => (
                <div key={c.name} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-700 truncate">{c.name}</span>
                  <span className="text-xs text-gray-400">หายไป {c.daysAgo} วัน</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}