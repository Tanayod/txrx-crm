'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconRefresh, IconChevronRight } from '@tabler/icons-react'

const DAYS_TH = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

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
  })

  const [peakDays, setPeakDays] = useState<number[]>([0,0,0,0,0,0,0])
  const [serviceBreakdown, setServiceBreakdown] = useState<any[]>([])
  const [prevServiceBreakdown, setPrevServiceBreakdown] = useState<any[]>([])
  const [topCustomers, setTopCustomers] = useState<any[]>([])
  const [agingCerts, setAgingCerts] = useState<any[]>([])
  const [inactiveCustomers, setInactiveCustomers] = useState<{ mou: any[], renew: any[] }>({ mou: [], renew: [] })

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

    // --- DTD ---
    const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)
    const yestStr = yesterday.toISOString().slice(0,10)
    const { data: todayBookings } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').eq('booking_date', todayStr)
    const { data: yestBookings } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').eq('booking_date', yestStr)
    const dtd = todayBookings?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0), 0) || 0
    const dtdPrev = yestBookings?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0), 0) || 0

    // --- WTD ---
    const dayOfWeek = today.getDay()
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const wtdDays = diffToMon + 1
    const startOfW = new Date(today); startOfW.setDate(today.getDate() - diffToMon)
    const startOfLastW = new Date(startOfW); startOfLastW.setDate(startOfW.getDate() - 7)
    const endOfLastW = new Date(startOfLastW); endOfLastW.setDate(startOfLastW.getDate() + 6)
    const { data: wtdData } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').gte('booking_date', startOfW.toISOString().slice(0,10)).lte('booking_date', todayStr)
    const { data: lastWData } = await supabase.from('bookings').select('booked_count, medical_cases(actual_count)').gte('booking_date', startOfLastW.toISOString().slice(0,10)).lte('booking_date', endOfLastW.toISOString().slice(0,10))
    const wtd = wtdData?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0), 0) || 0
    const wtdAvg = wtd / wtdDays
    const lastWTotal = lastWData?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0), 0) || 0
    const wtdPrevAvg = lastWTotal / 7

    // --- MTD ---
    const mtdDays = today.getDate()
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth()-1, 1)
    const daysInLastMonth = lastMonthEnd.getDate()
    const { data: mtdData } = await supabase.from('bookings').select('booked_count, service_type, booking_date, medical_cases(actual_count), payments(amount_received)').gte('booking_date', firstOfMonth).lte('booking_date', todayStr)
    const { data: lastMData } = await supabase.from('bookings').select('booked_count, service_type, medical_cases(actual_count), payments(amount_received)').gte('booking_date', lastMonthStart.toISOString().slice(0,10)).lte('booking_date', lastMonthEnd.toISOString().slice(0,10))
    const mtd = mtdData?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0), 0) || 0
    const mtdAvg = mtd / mtdDays
    const lastMTotal = lastMData?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0), 0) || 0
    const mtdPrevAvg = lastMTotal / daysInLastMonth

    // --- RANGE query ---
    let rangeQuery = supabase.from('bookings').select('*, customers(customer_name), medical_cases(*), payments(*)')
    if (from) rangeQuery = rangeQuery.gte('booking_date', from)
    if (to) rangeQuery = rangeQuery.lte('booking_date', to)
    const { data: rangeData } = await rangeQuery.order('booking_date', { ascending: false })

    // Prev range
    const f = new Date(from), t2 = new Date(to)
    const rangeDiff = t2.getTime() - f.getTime()
    const prevFrom = new Date(f.getTime() - rangeDiff - 86400000).toISOString().slice(0,10)
    const prevTo = new Date(f.getTime() - 86400000).toISOString().slice(0,10)
    let prevQuery = supabase.from('bookings').select('service_type, booked_count, medical_cases(actual_count), payments(amount_received)')
    prevQuery = prevQuery.gte('booking_date', prevFrom).lte('booking_date', prevTo)
    const { data: prevData } = await prevQuery

    // Utilization
    const totalBooked = rangeData?.reduce((s,b) => s + (b.booked_count || 0), 0) || 0
    const totalActual = rangeData?.reduce((s,b) => s + ((b.medical_cases as any)?.[0]?.actual_count || 0), 0) || 0
    const utilization = totalBooked > 0 ? Math.min(Math.round((totalActual/totalBooked)*100), 100) : 0

    // Revenue
    const revenue = rangeData?.reduce((s,b) => s + ((b.payments as any)?.[0]?.amount_received || 0), 0) || 0
    const prevRevenue = prevData?.reduce((s,b) => s + ((b.payments as any)?.[0]?.amount_received || 0), 0) || 0

    // Peak days
    const days = [0,0,0,0,0,0,0]
    rangeData?.forEach(b => { const d = new Date(b.booking_date).getDay(); days[d] += ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0) })
    setPeakDays(days)

    // Service breakdown
    const services: any = {}, prevServices: any = {}
    rangeData?.forEach(b => { const s = b.service_type || 'ไม่ระบุ'; services[s] = (services[s]||0) + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0) })
    prevData?.forEach(b => { const s = b.service_type || 'ไม่ระบุ'; prevServices[s] = (prevServices[s]||0) + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0) })
    setServiceBreakdown(Object.entries(services).sort((a:any,b:any) => b[1]-a[1]).map(([k,v]) => ({ name: k, count: v as number })))
    setPrevServiceBreakdown(Object.entries(prevServices).map(([k,v]) => ({ name: k, count: v as number })))

    // Top customers
    const custCount: any = {}
    rangeData?.forEach(b => { const n = b.customers?.customer_name; if (n) custCount[n] = (custCount[n]||0) + ((b.medical_cases as any)?.[0]?.actual_count || b.booked_count || 0) })
    setTopCustomers(Object.entries(custCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,10).map(([name,count]) => ({ name, count })))

    // Active & Repeat customers
    const activeSet = new Set(rangeData?.map(b => b.customers?.customer_name).filter(Boolean))
    const custBookings: any = {}
    rangeData?.forEach(b => { const n = b.customers?.customer_name; if (n) custBookings[n] = (custBookings[n]||0) + 1 })
    const repeatCount = Object.values(custBookings).filter((v:any) => v > 1).length
    const repeatRate = activeSet.size > 0 ? Math.round((repeatCount/activeSet.size)*100) : 0

    // Retention — inactive 90 days
    const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate()-90)
    const { data: allBookings } = await supabase.from('bookings').select('booking_date, service_type, customers(customer_name)').gte('booking_date', ninetyDaysAgo.toISOString().slice(0,10)).lte('booking_date', yestStr)
    const lastSeen: any = {}
    allBookings?.forEach(b => {
      const n = b.customers?.customer_name
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

    // Aging certs
    const { data: aging } = await supabase.from('medical_cases').select('*, bookings(case_number, booked_count, customers(customer_name))').eq('cert_status', 'รอส่ง').lt('cert_deadline', todayStr).order('cert_deadline', { ascending: true }).limit(5)
    setAgingCerts(aging || [])

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
      overdueCerts: aging?.length || 0,
      revenue, prevRevenue,
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

  const Trend = ({ cur, prev }: { cur: number, prev: number }) => {
    const { pct, up } = pctDiff(cur, prev)
    return (
      <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-500' : 'text-red-400'}`}>
        {up ? <IconTrendingUp size={12}/> : <IconTrendingDown size={12}/>}
        {up ? '+' : '-'}{pct}%
      </span>
    )
  }

  const maxPeak = Math.max(...peakDays, 1)
  const maxCust = (topCustomers[0]?.count as number) || 1

  if (!ready) return <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#0F172A]">
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />
      <div className="flex-1 ml-56 p-6 overflow-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-lg font-bold text-white tracking-tight">TXRX Analytics</p>
            <p className="text-xs text-slate-400 mt-0.5">{from} — {to}</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={filterMonth}
              onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo('') }}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-slate-500 text-xs">หรือ</span>
            <input type="date" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setFilterMonth('') }}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-slate-500 text-xs">ถึง</span>
            <input type="date" value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setFilterMonth('') }}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleFilter}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
              <IconRefresh size={14}/> กรอง
            </button>
          </div>
        </div>

        {/* KPI Row 1 — DTD / WTD / MTD */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          {/* DTD */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Day to Date</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-white">{loading ? '—' : kpi.dtd.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">คน · วันนี้</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.dtd} prev={kpi.dtdPrev}/>
                <p className="text-xs text-slate-500 mt-0.5">vs เมื่อวาน {kpi.dtdPrev}</p>
              </div>
            </div>
          </div>
          {/* WTD */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Week to Date</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-white">{loading ? '—' : kpi.wtd.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">รวม · เฉลี่ย {loading ? '—' : kpi.wtdAvg.toFixed(1)}/วัน</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.wtdAvg} prev={kpi.wtdPrevAvg}/>
                <p className="text-xs text-slate-500 mt-0.5">vs สัปดาห์ก่อน {kpi.wtdPrevAvg.toFixed(1)}/วัน</p>
              </div>
            </div>
          </div>
          {/* MTD */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Month to Date</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold text-white">{loading ? '—' : kpi.mtd.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">รวม · เฉลี่ย {loading ? '—' : kpi.mtdAvg.toFixed(1)}/วัน</p>
              </div>
              <div className="text-right">
                <Trend cur={kpi.mtdAvg} prev={kpi.mtdPrevAvg}/>
                <p className="text-xs text-slate-500 mt-0.5">vs เดือนก่อน {kpi.mtdPrevAvg.toFixed(1)}/วัน</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Row 2 */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          {/* Utilization */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 backdrop-blur col-span-1">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Utilization</p>
            <p className="text-3xl font-bold text-blue-400">{loading ? '—' : `${kpi.utilization}%`}</p>
            <div className="mt-2 bg-slate-700 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${kpi.utilization}%` }}/>
            </div>
            <p className="text-xs text-slate-500 mt-1">จอง vs ตรวจจริง</p>
          </div>
          {/* Revenue */}
          <div className="bg-gradient-to-br from-emerald-900/50 to-slate-800/60 border border-emerald-700/30 rounded-2xl p-4 backdrop-blur col-span-2 cursor-pointer" onClick={() => window.location.href='/payments'}>
            <p className="text-xs text-emerald-400 uppercase tracking-widest mb-2">รับเงินช่วงนี้</p>
            <p className="text-3xl font-bold text-emerald-400">฿{loading ? '—' : kpi.revenue.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-1">
              <Trend cur={kpi.revenue} prev={kpi.prevRevenue}/>
              <span className="text-xs text-slate-500">vs ช่วงก่อน</span>
            </div>
          </div>
          {/* Active Customers */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Active</p>
            <p className="text-3xl font-bold text-white">{loading ? '—' : kpi.activeCustomers}</p>
            <p className="text-xs text-slate-500 mt-1">จาก {kpi.totalCustomers} ราย</p>
          </div>
          {/* Repeat Rate */}
          <div className="bg-gradient-to-br from-purple-900/50 to-slate-800/60 border border-purple-700/30 rounded-2xl p-4 backdrop-blur">
            <p className="text-xs text-purple-400 uppercase tracking-widest mb-2">Repeat Rate</p>
            <p className="text-3xl font-bold text-purple-400">{loading ? '—' : `${kpi.repeatRate}%`}</p>
            <p className="text-xs text-slate-500 mt-1">Loyalty</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Peak Day */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-5">Peak Day Analysis</p>
            <div className="flex items-end gap-2 h-32">
              {DAYS_TH.map((d, i) => {
                const isPeak = peakDays[i] === Math.max(...peakDays) && peakDays[i] > 0
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1.5">
                    {peakDays[i] > 0 && <span className="text-xs text-slate-400">{peakDays[i]}</span>}
                    <div className="w-full rounded-t-lg transition-all duration-500 relative overflow-hidden" style={{
                      height: `${Math.round((peakDays[i]/maxPeak)*100)}%`,
                      minHeight: peakDays[i] > 0 ? '6px' : '2px',
                      background: isPeak ? 'linear-gradient(to top, #2563EB, #60A5FA)' : '#334155'
                    }}>
                      {isPeak && <div className="absolute inset-0 bg-blue-400/20 animate-pulse"/>}
                    </div>
                    <span className={`text-xs ${isPeak ? 'text-blue-400 font-semibold' : 'text-slate-500'}`}>{d}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Service Breakdown */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">ประเภทงาน</p>
            <div className="space-y-3">
              {serviceBreakdown.length === 0 && !loading && <p className="text-sm text-slate-500 text-center py-4">ไม่มีข้อมูล</p>}
              {serviceBreakdown.map(s => {
                const prev = prevServiceBreakdown.find(p => p.name === s.name)?.count || 0
                const { pct, up } = pctDiff(s.count, prev)
                const colors: any = { 'ตรวจนอกสถานที่ (Mobile)': '#3B82F6', 'คลินิก': '#8B5CF6', 'Walk-in': '#10B981' }
                const color = colors[s.name] || '#64748B'
                return (
                  <div key={s.name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-300">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{s.count.toLocaleString()}</span>
                        <span className={`text-xs ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                          {up?'+':'-'}{pct}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.round((s.count/(serviceBreakdown[0]?.count||1))*100)}%`, background: color }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-700 grid grid-cols-2 gap-2">
              <div className="bg-red-900/30 border border-red-700/30 rounded-xl p-3 cursor-pointer" onClick={() => window.location.href='/payments'}>
                <p className="text-xs text-red-400 mb-0.5">ค้างชำระ</p>
                <p className="text-2xl font-bold text-red-400">{kpi.pendingPayments}</p>
                <p className="text-xs text-red-500/70">รายการ</p>
              </div>
              <div className="bg-amber-900/30 border border-amber-700/30 rounded-xl p-3 cursor-pointer" onClick={() => window.location.href='/medical'}>
                <p className="text-xs text-amber-400 mb-0.5">ค้างใบแพทย์</p>
                <p className="text-2xl font-bold text-amber-400">{kpi.overdueCerts}</p>
                <p className="text-xs text-amber-500/70">เกิน 3 วัน</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Top Customers */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Top Customers</p>
              <span className="text-xs text-blue-400">{topCustomers.length} ราย</span>
            </div>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {topCustomers.length === 0 && !loading && <p className="text-sm text-slate-500 text-center py-4">ไม่มีข้อมูล</p>}
              {topCustomers.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-4 text-right font-mono">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-slate-300 truncate">{c.name}</span>
                      <span className="text-xs font-bold text-white ml-2 flex-shrink-0">{c.count}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1">
                      <div className="h-1 rounded-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${Math.round((c.count/maxCust)*100)}%` }}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Aging Certs */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Aging ใบแพทย์</p>
              <span className="text-xs text-red-400">{kpi.overdueCerts} ใบ</span>
            </div>
            <div className="space-y-2">
              {agingCerts.length === 0 && !loading && (
                <div className="text-center py-6">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-sm text-emerald-400">ไม่มีค้างใบแพทย์</p>
                </div>
              )}
              {agingCerts.map(c => {
                const daysOver = Math.floor((new Date().getTime() - new Date(c.cert_deadline).getTime()) / 86400000)
                const pending = ((c.bookings as any)?.booked_count || 0) - (c.actual_count || 0)
                return (
                  <div key={c.id} className="flex items-center justify-between p-2.5 bg-red-900/20 border border-red-700/20 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{(c.bookings as any)?.customers?.customer_name}</p>
                      <p className="text-xs text-slate-500">{(c.bookings as any)?.case_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs font-bold text-red-400">{pending > 0 ? `${pending} ใบ` : ''}</p>
                      <span className="text-xs text-red-500/70 flex items-center gap-0.5 justify-end">
                        <IconAlertTriangle size={9}/>{daysOver}วัน
                      </span>
                    </div>
                  </div>
                )
              })}
              {kpi.overdueCerts > 5 && (
                <button onClick={() => window.location.href='/medical'} className="w-full text-xs text-slate-500 hover:text-blue-400 flex items-center justify-center gap-1 pt-1 transition-colors">
                  ดูทั้งหมด <IconChevronRight size={12}/>
                </button>
              )}
            </div>
          </div>

          {/* Retention */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">💤 Retention (90 วัน)</p>
            <div className="mb-3">
              <p className="text-xs text-blue-400 font-semibold mb-2">📌 MOU / ไฟล์ทบิน</p>
              <div className="space-y-1.5">
                {inactiveCustomers.mou.length === 0 && <p className="text-xs text-slate-600">ไม่มี</p>}
                {inactiveCustomers.mou.map(c => (
                  <div key={c.name} className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 truncate flex-1">{c.name}</span>
                    <span className="text-xs text-slate-500 ml-2 flex-shrink-0">หาย {c.daysAgo} วัน</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-700 pt-3">
              <p className="text-xs text-amber-400 font-semibold mb-2">📌 ต่ออายุ / อื่นๆ</p>
              <div className="space-y-1.5">
                {inactiveCustomers.renew.length === 0 && <p className="text-xs text-slate-600">ไม่มี</p>}
                {inactiveCustomers.renew.map(c => (
                  <div key={c.name} className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 truncate flex-1">{c.name}</span>
                    <span className="text-xs text-slate-500 ml-2 flex-shrink-0">หาย {c.daysAgo} วัน</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}