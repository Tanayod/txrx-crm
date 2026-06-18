'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconRefresh, IconChevronRight } from '@tabler/icons-react'

const DAYS_TH = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const getMc = (b: any) => Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases

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
    const todayStr = today.toISOString().slice(0,10)
    const { from, to } = getDateRange()

    // DTD
    const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
    const yestStr = yesterday.toISOString().slice(0,10)
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
    const { data: wtdData } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').gte('booking_date', startOfW.toISOString().slice(0,10)).lte('booking_date', todayStr)
    const { data: lastWData } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').gte('booking_date', startOfLastW.toISOString().slice(0,10)).lte('booking_date', endOfLastW.toISOString().slice(0,10))
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
    const { data: lastMData } = await supabase.from('bookings').select('booked_count, service_type, medical_cases(actual_count), payments(amount_received)').gte('booking_date', lastMonthStart.toISOString().slice(0,10)).lte('booking_date', lastMonthEnd.toISOString().slice(0,10))
    const mtd = mtdData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const mtdAvg = mtd / mtdDays
    const lastMTotal = lastMData?.reduce((s,b) => s + (getMc(b)?.actual_count || b.booked_count || 0), 0) || 0
    const mtdPrevAvg = lastMTotal / daysInLastMonth

    // Range
    let rangeQuery = supabase.from('bookings').select('*, customers(customer_name), medical_cases(*), payments(*)')
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

    // Utilization
    const totalBooked = rangeData?.reduce((s,b) => s + (b.booked_count || 0), 0) || 0
    const totalActual = rangeData?.reduce((s,b) => s + (getMc(b)?.actual_count || 0), 0) || 0
    const utilization = totalBooked > 0 ? Math.min(Math.round((totalActual/totalBooked)*100), 100) : 0

    // ✅ ยอดตรวจรวมตามช่วงที่กรอง (เทียบช่วงก่อนหน้า)
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
    const { data: allBookings } = await supabase.from('bookings').select('booking_date, service_type, customers(customer_name)').gte('booking_date', ninetyDaysAgo.toISOString().slice(0,10)).lte('booking_date', yestStr)
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

    // ✅ Aging certs — นับเฉพาะ cert_status = 'รอส่ง' เท่านั้น
    let allYearMedical: any[] = []
    let agingFrom = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('case_number, booking_date, booked_count, customers(customer_name), medical_cases(actual_count, cert_status)')
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
        return {
          case_number: b.case_number,
          customer_name: (b.customers as any)?.customer_name,
          booking_date: b.booking_date,
          pending: (mc && mc.cert_status === 'รอส่ง') ? (mc.actual_count || 0) : 0,
          daysOver: Math.floor((today.getTime() - new Date(b.booking_date).getTime()) / 86400000)
        }
      })
      .filter(b => b.pending > 0)
      .sort((a, b) => b.pending - a.pending)

    const totalPendingCerts = agingList.reduce((s, b) => s + b.pending, 0)
    setAgingCerts(agingList.slice(0, 5))

    // ✅ สรุปยอดหนี้ค้าง แยกตามประเภทงาน
    let allDebtBookings: any[] = []
    let debtFrom = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('service_type, payments(amount_received, total_amount, payment_status)')
        .range(debtFrom, debtFrom + 999)
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
    setDebtByService(Object.entries(debtByType).sort((a: any, b: any) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })))
    setTotalDebt(debtSum)

    // ✅ สรุปยอดขายซิมตาม package + ประเภท (ตามช่วงที่กรอง)
    let allSimItems: any[] = []
    let simFrom = 0
    while (true) {
      let q = supabase.from('sim_items').select('sim_package, sim_type, sim_count, bookings(booking_date)')
      const { data: chunk } = await q.range(simFrom, simFrom + 999)
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

    // ✅ สรุปยอดตรวจพิเศษ (ตามช่วงที่กรอง)
    let allSpecialItems: any[] = []
    let spFrom = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('special_exam_items')
        .select('exam_name, quantity, subtotal, special_exams(exam_date)')
        .range(spFrom, spFrom + 999)
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

    // Pending payments
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
    })
    setLoading(false)
  }

  const handleFilter = () => { setLoaded(false) }
  const { from, to } = getDateRange()

  const pctDiff = (cur: number, prev: number) => {
    if (prev === 0) return { pct: 0, up: true }
    const p = ((cur - prev) / prev * 100)
    return { pct: Math.abs(Math.round(p)), up: p >= 0 }
  }

  const Trend = ({ cur, prev, label }: { cur: number, prev: number, label?: string }) => {
    const { pct, up } = pctDiff(cur, prev)
    return (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
        {up ? <IconTrendingUp size={11}/> : <IconTrendingDown size={11}/>}
        {up ? '+' : '-'}{pct}% {label || ''}
      </span>
    )
  }

  const maxPeak = Math.max(...peakDays, 1)
  const maxCust = (topCustomers[0]?.count as number) || 1

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />
      <div className="flex-1 ml-56 p-6 overflow-auto">

        <div className="flex justify-between items-center mb-5">
          <div>
            <p className="text-base font-semibold text-gray-800">Dashboard</p>
            <p className="text-xs text-gray-400 mt-0.5">{from} — {to}</p>
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

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Day to Date</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-800">{loading ? '—' : kpi.dtd.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">คน · วันนี้</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.dtd} prev={kpi.dtdPrev}/>
                <p className="text-xs text-gray-400 mt-0.5">vs เมื่อวาน {kpi.dtdPrev}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Week to Date</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-800">{loading ? '—' : kpi.wtd.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">รวม · เฉลี่ย {loading ? '—' : kpi.wtdAvg.toFixed(1)}/วัน</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.wtdAvg} prev={kpi.wtdPrevAvg}/>
                <p className="text-xs text-gray-400 mt-0.5">vs สัปดาห์ก่อน {kpi.wtdPrevAvg.toFixed(1)}/วัน</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">Month to Date</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-gray-800">{loading ? '—' : kpi.mtd.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">รวม · เฉลี่ย {loading ? '—' : kpi.mtdAvg.toFixed(1)}/วัน</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.mtdAvg} prev={kpi.mtdPrevAvg}/>
                <p className="text-xs text-gray-400 mt-0.5">vs เดือนก่อน {kpi.mtdPrevAvg.toFixed(1)}/วัน</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-3 mb-4">
          <div className="bg-white border-l-4 border-l-sky-500 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ยอดตรวจช่วงที่กรอง</p>
            <p className="text-3xl font-bold text-sky-600">{loading ? '—' : kpi.rangeTotal.toLocaleString()}</p>
            <Trend cur={kpi.rangeTotal} prev={kpi.prevRangeTotal} label="vs ช่วงก่อน"/>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Utilization</p>
            <p className="text-3xl font-bold text-[#185FA5]">{loading ? '—' : `${kpi.utilization}%`}</p>
            <div className="mt-2 bg-gray-100 rounded-full h-1.5">
              <div className="bg-[#185FA5] h-1.5 rounded-full transition-all" style={{ width: `${kpi.utilization}%` }}/>
            </div>
            <p className="text-xs text-gray-400 mt-1">จอง vs ตรวจจริง</p>
          </div>
          <div className="bg-white border-l-4 border-l-emerald-500 border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer" onClick={() => window.location.href='/payments'}>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">รับเงินช่วงนี้</p>
            <p className="text-3xl font-bold text-emerald-600">฿{loading ? '—' : kpi.revenue.toLocaleString()}</p>
            <Trend cur={kpi.revenue} prev={kpi.prevRevenue} label="vs ช่วงก่อน"/>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Active</p>
            <p className="text-3xl font-bold text-gray-800">{loading ? '—' : kpi.activeCustomers}</p>
            <p className="text-xs text-gray-400 mt-1">จาก {kpi.totalCustomers} ราย</p>
          </div>
          <div className="bg-white border-l-4 border-l-purple-500 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Repeat Rate</p>
            <p className="text-3xl font-bold text-purple-600">{loading ? '—' : `${kpi.repeatRate}%`}</p>
            <p className="text-xs text-gray-400 mt-1">Loyalty</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-5">📊 Peak Day Analysis</p>
            <div className="flex items-end gap-2 h-32">
              {DAYS_TH.map((d, i) => {
                const isPeak = peakDays[i] === Math.max(...peakDays) && peakDays[i] > 0
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1.5">
                    {peakDays[i] > 0 && <span className="text-xs text-gray-500">{peakDays[i]}</span>}
                    <div className="w-full rounded-t-lg transition-all duration-500" style={{
                      height: `${Math.round((peakDays[i]/maxPeak)*100)}%`,
                      minHeight: peakDays[i] > 0 ? '6px' : '2px',
                      background: isPeak ? '#185FA5' : '#BFDBFE'
                    }}/>
                    <span className={`text-xs ${isPeak ? 'text-[#185FA5] font-bold' : 'text-gray-400'}`}>{d}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-4">📋 ประเภทงาน (เทียบช่วงก่อน)</p>
            <div className="space-y-3">
              {serviceBreakdown.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูล</p>}
              {serviceBreakdown.map(s => {
                const prev = prevServiceBreakdown.find(p => p.name === s.name)?.count || 0
                const { pct, up } = pctDiff(s.count, prev)
                const colors: any = { 'ตรวจนอกสถานที่ (Mobile)': '#185FA5', 'คลินิก': '#7C3AED', 'Walk-in': '#059669', 'ไฟล์ทบิน': '#0EA5E9' }
                const color = colors[s.name] || '#94A3B8'
                return (
                  <div key={s.name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{s.count.toLocaleString()}</span>
                        <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up?'+':'-'}{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.round((s.count/(serviceBreakdown[0]?.count||1))*100)}%`, background: color }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 cursor-pointer" onClick={() => window.location.href='/payments'}>
                <p className="text-xs text-red-500 font-semibold mb-0.5">ค้างชำระ</p>
                <p className="text-2xl font-bold text-red-500">{kpi.pendingPayments}</p>
                <p className="text-xs text-red-400">รายการ</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 cursor-pointer" onClick={() => window.location.href='/medical'}>
                <p className="text-xs text-amber-600 font-semibold mb-0.5">ค้างใบแพทย์</p>
                <p className="text-2xl font-bold text-amber-500">{kpi.overdueCerts.toLocaleString()}</p>
                <p className="text-xs text-amber-400">ใบ · รอส่ง</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">👥 Top Customers</p>
              <span className="text-xs text-[#185FA5] font-semibold">{topCustomers.length} ราย</span>
            </div>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {topCustomers.length === 0 && !loading && <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูล</p>}
              {topCustomers.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-4 text-right font-mono">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-gray-700 truncate">{c.name}</span>
                      <span className="text-xs font-bold text-gray-800 ml-2 flex-shrink-0">{c.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-[#185FA5]" style={{ width: `${Math.round((c.count/maxCust)*100)}%` }}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">⚠️ Aging ใบแพทย์</p>
              <span className="text-xs bg-red-50 text-red-500 font-semibold px-2 py-0.5 rounded-full">รอส่ง {kpi.overdueCerts.toLocaleString()} ใบ</span>
            </div>
            <div className="space-y-2">
              {agingCerts.length === 0 && !loading && (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-sm text-emerald-600 font-medium">ไม่มีค้างใบแพทย์</p>
                </div>
              )}
              {agingCerts.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-red-50 border border-red-100 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{c.customer_name}</p>
                    <p className="text-xs text-gray-400">{c.case_number} · {c.booking_date}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs font-bold text-red-500">{c.pending} ใบ</p>
                    <span className="text-xs text-red-400 flex items-center gap-0.5 justify-end">
                      <IconAlertTriangle size={9}/> ค้าง {c.daysOver} วัน
                    </span>
                  </div>
                </div>
              ))}
              {agingCerts.length > 0 && (
                <button onClick={() => window.location.href='/medical'} className="w-full text-xs text-gray-400 hover:text-[#185FA5] flex items-center justify-center gap-1 pt-1 transition-colors">
                  ดูทั้งหมด <IconChevronRight size={12}/>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-4">💤 Retention (90 วัน)</p>
            <div className="mb-3">
              <p className="text-xs text-[#185FA5] font-bold mb-2">📌 MOU / ไฟล์ทบิน</p>
              <div className="space-y-1.5">
                {inactiveCustomers.mou.length === 0 && <p className="text-xs text-gray-400">ไม่มี</p>}
                {inactiveCustomers.mou.map(c => (
                  <div key={c.name} className="flex items-center justify-between py-1 border-b border-gray-50">
                    <span className="text-xs text-gray-700 truncate flex-1">{c.name}</span>
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">หาย {c.daysAgo} วัน</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-amber-600 font-bold mb-2">📌 ต่ออายุ / อื่นๆ</p>
              <div className="space-y-1.5">
                {inactiveCustomers.renew.length === 0 && <p className="text-xs text-gray-400">ไม่มี</p>}
                {inactiveCustomers.renew.map(c => (
                  <div key={c.name} className="flex items-center justify-between py-1 border-b border-gray-50">
                    <span className="text-xs text-gray-700 truncate flex-1">{c.name}</span>
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">หาย {c.daysAgo} วัน</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">💳 สรุปยอดหนี้ค้างชำระ (รวมยอดยกมา)</p>
            <span className="text-xl font-bold text-red-500">฿{loading ? '—' : totalDebt.toLocaleString()}</span>
          </div>
          {debtByService.length === 0 && !loading ? (
            <p className="text-sm text-gray-400 text-center py-4">ไม่มียอดค้างชำระ</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {debtByService.map(d => {
                const colors: any = { 'ตรวจนอกสถานที่ (Mobile)': '#185FA5', 'คลินิก': '#7C3AED', 'Walk-in': '#059669', 'ไฟล์ทบิน': '#0EA5E9' }
                const color = colors[d.name] || '#94A3B8'
                return (
                  <div key={d.name} className="bg-red-50 border border-red-100 rounded-xl p-3 cursor-pointer" onClick={() => window.location.href='/customers'}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: color }}/>
                      <p className="text-xs text-gray-600 truncate">{d.name}</p>
                    </div>
                    <p className="text-base font-bold text-red-500">฿{d.amount.toLocaleString()}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-4">📱 สรุปยอดขายซิมตามแพ็กเกจ</p>
            {simSummary.length === 0 && !loading ? (
              <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              <div className="space-y-2">
                {simSummary.map((s, i) => (
                  <div key={i} className="flex justify-between items-center bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-700">฿{s.package}/เดือน</span>
                      <span className="text-xs text-gray-400 ml-2">{s.type}</span>
                    </div>
                    <span className="text-sm font-bold text-purple-600">{s.count} ซิม</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-600">รวมทั้งหมด</span>
                  <span className="text-sm font-bold text-purple-700">{simSummary.reduce((s: number, x: any) => s + x.count, 0)} ซิม</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">🔬 สรุปยอดตรวจพิเศษ</p>
              <span className="text-sm font-bold text-blue-600">฿{loading ? '—' : specialExamTotal.toLocaleString()}</span>
            </div>
            {specialExamSummary.length === 0 && !loading ? (
              <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              <div className="space-y-2">
                {specialExamSummary.map((s, i) => (
                  <div key={i} className="flex justify-between items-center bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-2">×{s.count}</span>
                    </div>
                    <span className="text-sm font-bold text-blue-600">฿{s.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}