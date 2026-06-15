'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconTrendingUp, IconTrendingDown, IconUsers, IconCalendar, IconCash, IconFileText, IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const DAYS_TH = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function Dashboard() {
  const { user, role, ready, logout } = useAuth('/dashboard')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)

  // KPI
  const [kpi, setKpi] = useState({ today: 0, rangeTotal: 0, prevTotal: 0, activeCustomers: 0, totalCustomers: 0, repeatRate: 0, pendingPayments: 0, overdueCerts: 0, revenue: 0, prevRevenue: 0 })

  // Charts
  const [peakDays, setPeakDays] = useState<number[]>([0,0,0,0,0,0,0])
  const [serviceBreakdown, setServiceBreakdown] = useState<any[]>([])
  const [prevServiceBreakdown, setPrevServiceBreakdown] = useState<any[]>([])
  const [topCustomers, setTopCustomers] = useState<any[]>([])
  const [agingCerts, setAgingCerts] = useState<any[]>([])

  // Filters
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

  const getPrevDateRange = (from: string, to: string) => {
    const f = new Date(from), t = new Date(to)
    const diff = t.getTime() - f.getTime()
    const pf = new Date(f.getTime() - diff - 86400000)
    const pt = new Date(f.getTime() - 86400000)
    return {
      from: pf.toISOString().slice(0,10),
      to: pt.toISOString().slice(0,10)
    }
  }

  if (ready && !loaded) { fetchAll(); setLoaded(true) }

  async function fetchAll() {
    setLoading(true)
    const today = new Date().toISOString().slice(0,10)
    const { from, to } = getDateRange()
    const prev = getPrevDateRange(from, to)

    // Today bookings
    const { data: todayData } = await supabase.from('bookings').select('id').eq('booking_date', today)

    // Range bookings
    let rangeQuery = supabase.from('bookings').select('*, customers(customer_name), payments(*), medical_cases(*)')
    if (from) rangeQuery = rangeQuery.gte('booking_date', from)
    if (to) rangeQuery = rangeQuery.lte('booking_date', to)
    const { data: rangeData } = await rangeQuery.order('booking_date', { ascending: false })

    // Prev range bookings
    let prevQuery = supabase.from('bookings').select('id, service_type, booked_count, payments(*)')
    if (prev.from) prevQuery = prevQuery.gte('booking_date', prev.from)
    if (prev.to) prevQuery = prevQuery.lte('booking_date', prev.to)
    const { data: prevData } = await prevQuery

    // Customers
    const { data: allCustomers } = await supabase.from('customers').select('id')
    const activeIds = new Set(rangeData?.map(b => b.customers?.customer_name).filter(Boolean))
    const repeatIds = rangeData?.filter(b => {
      const name = b.customers?.customer_name
      return name && rangeData.filter(x => x.customers?.customer_name === name).length > 1
    }).map(b => b.customers?.customer_name)
    const uniqueRepeat = new Set(repeatIds)

    // Revenue
    const revenue = rangeData?.reduce((sum, b) => sum + (b.payments?.[0]?.amount_received || 0), 0) || 0
    const prevRevenue = prevData?.reduce((sum, b) => sum + (b.payments?.[0]?.amount_received || 0), 0) || 0

    // Peak days (count by day of week)
    const days = [0,0,0,0,0,0,0]
    rangeData?.forEach(b => {
      const d = new Date(b.booking_date).getDay()
      days[d] += (b.booked_count || 1)
    })
    setPeakDays(days)

    // Service breakdown
    const services: any = {}
    rangeData?.forEach(b => {
      const s = b.service_type || 'ไม่ระบุ'
      services[s] = (services[s] || 0) + (b.booked_count || 1)
    })
    const prevServices: any = {}
    prevData?.forEach(b => {
      const s = b.service_type || 'ไม่ระบุ'
      prevServices[s] = (prevServices[s] || 0) + (b.booked_count || 1)
    })
    setServiceBreakdown(Object.entries(services).map(([k,v]) => ({ name: k, count: v as number })))
    setPrevServiceBreakdown(Object.entries(prevServices).map(([k,v]) => ({ name: k, count: v as number })))

    // Top customers
    const custCount: any = {}
    rangeData?.forEach(b => {
      const name = b.customers?.customer_name
      if (name) custCount[name] = (custCount[name] || 0) + (b.booked_count || 1)
    })
    const sorted = Object.entries(custCount).sort((a:any,b:any) => b[1]-a[1]).slice(0,10)
    setTopCustomers(sorted.map(([name, count]) => ({ name, count })))

    // Aging certs
    const { data: aging } = await supabase
      .from('medical_cases')
      .select('*, bookings(case_number, customers(customer_name))')
      .eq('cert_status', 'รอส่ง')
      .lt('cert_deadline', today)
      .order('cert_deadline', { ascending: true })
      .limit(5)
    setAgingCerts(aging || [])

    // Pending payments
    const { data: pendingData } = await supabase.from('payments').select('id').in('payment_status', ['ยังไม่ชำระ','ค้างชำระ'])

    setKpi({
      today: todayData?.length || 0,
      rangeTotal: rangeData?.reduce((s,b) => s + (b.booked_count || 1), 0) || 0,
      prevTotal: prevData?.reduce((s,b) => s + (b.booked_count || 1), 0) || 0,
      activeCustomers: activeIds.size,
      totalCustomers: allCustomers?.length || 0,
      repeatRate: activeIds.size > 0 ? Math.round((uniqueRepeat.size / activeIds.size) * 100) : 0,
      pendingPayments: pendingData?.length || 0,
      overdueCerts: aging?.length || 0,
      revenue,
      prevRevenue,
    })
    setLoading(false)
  }

  const handleFilter = () => { setLoaded(false) }

  const diff = (cur: number, prev: number) => {
    if (prev === 0) return { val: 0, pct: 0 }
    const d = cur - prev
    return { val: d, pct: Math.round((d/prev)*100) }
  }

  const maxPeak = Math.max(...peakDays, 1)
  const maxCust = topCustomers[0]?.count || 1
  const { from, to } = getDateRange()

  const KpiCard = ({ label, value, sub, prev, color, onClick }: any) => {
    const d = diff(value, prev ?? value)
    return (
      <div onClick={onClick} className={`bg-white border border-gray-100 rounded-xl p-4 ${onClick ? 'cursor-pointer hover:border-[#185FA5] transition-colors' : ''}`}>
        <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold ${color || 'text-gray-800'}`}>{loading ? '—' : value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        {prev !== undefined && !loading && (
          <div className="flex items-center gap-1 mt-1.5">
            {d.val >= 0
              ? <IconTrendingUp size={12} className="text-green-500" />
              : <IconTrendingDown size={12} className="text-red-400" />}
            <span className={`text-xs ${d.val >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {d.val >= 0 ? '+' : ''}{d.val} ({d.pct}%) เทียบช่วงก่อน
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">

        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <p className="text-base font-semibold text-gray-800">Dashboard</p>
            <p className="text-xs text-gray-400 mt-0.5">{from} — {to}</p>
          </div>
          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs text-gray-400 mr-1">กรองรายเดือน</label>
              <input type="month" value={filterMonth}
                onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo('') }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <span className="text-xs text-gray-400">หรือ</span>
            <input type="date" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setFilterMonth('') }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            <span className="text-xs text-gray-400">ถึง</span>
            <input type="date" value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setFilterMonth('') }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            <button onClick={handleFilter}
              className="bg-[#185FA5] text-white px-4 py-1.5 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-1.5">
              <IconRefresh size={14} /> กรอง
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <KpiCard label="TODAY" value={loading ? '—' : kpi.today} sub="รายการวันนี้"
            onClick={() => window.location.href='/bookings'} />
          <KpiCard label="RANGE TOTAL" value={loading ? '—' : `${kpi.rangeTotal.toLocaleString()} เคส`}
            sub="ในช่วงที่เลือก" prev={kpi.prevTotal} />
          <KpiCard label="รับเงินช่วงนี้" value={loading ? '—' : `฿${kpi.revenue.toLocaleString()}`}
            color="text-green-600" prev={kpi.prevRevenue}
            onClick={() => window.location.href='/payments'} />
          <KpiCard label="ACTIVE CUSTOMERS" value={loading ? '—' : kpi.activeCustomers}
            sub={`จากลูกค้าทั้งหมด ${kpi.totalCustomers} ราย`} />
          <KpiCard label="REPEAT RATE" value={loading ? '—' : `${kpi.repeatRate}%`}
            sub="Loyalty Analysis" color="text-[#185FA5]" />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Peak Day Analysis */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">📊 Peak Day Analysis</p>
            <div className="flex items-end gap-2 h-36">
              {DAYS_TH.map((d, i) => (
                <div key={d} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{peakDays[i] || ''}</span>
                  <div className="w-full rounded-t-md transition-all" style={{
                    height: `${Math.round((peakDays[i]/maxPeak)*100)}%`,
                    minHeight: peakDays[i] > 0 ? '4px' : '0',
                    background: peakDays[i] === Math.max(...peakDays) ? '#185FA5' : '#93C5FD'
                  }} />
                  <span className="text-xs text-gray-400">{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Service Breakdown */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">📋 รายประเภทงาน (เทียบช่วงก่อนหน้า)</p>
            <div className="space-y-3">
              {serviceBreakdown.length === 0 && !loading && (
                <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูล</p>
              )}
              {serviceBreakdown.map(s => {
                const prev = prevServiceBreakdown.find(p => p.name === s.name)?.count || 0
                const d = diff(s.count, prev)
                return (
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{s.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{s.count.toLocaleString()}</span>
                          <span className={`text-xs ${d.val >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                            {d.val >= 0 ? '+' : ''}{d.val} ({d.pct}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div className="bg-red-50 rounded-lg p-3 cursor-pointer" onClick={() => window.location.href='/payments'}>
                <p className="text-xs text-red-400 mb-0.5">ค้างชำระ</p>
                <p className="text-xl font-semibold text-red-500">{kpi.pendingPayments}</p>
                <p className="text-xs text-red-400">รายการ</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 cursor-pointer" onClick={() => window.location.href='/medical'}>
                <p className="text-xs text-amber-400 mb-0.5">ค้างใบแพทย์</p>
                <p className="text-xl font-semibold text-amber-500">{kpi.overdueCerts}</p>
                <p className="text-xs text-amber-400">เกิน 3 วัน</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Top Customers */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">👥 รายชื่อลูกค้า</p>
              <span className="text-xs text-[#185FA5]">ทั้งหมด {topCustomers.length} ราย</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {topCustomers.length === 0 && !loading && (
                <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูล</p>
              )}
              {topCustomers.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-right">{i+1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-sm text-gray-700">{c.name}</span>
                      <span className="text-sm font-semibold text-gray-800">{c.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-[#185FA5] h-1.5 rounded-full" style={{ width: `${Math.round((c.count/maxCust)*100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Aging Certs */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">⚠️ Aging ค้างใบแพทย์</p>
              <span className="text-xs text-red-400">รวม {kpi.overdueCerts} ใบ</span>
            </div>
            <div className="space-y-2">
              {agingCerts.length === 0 && !loading && (
                <div className="text-center py-6">
                  <p className="text-sm text-green-600 font-medium">✅ ไม่มีค้างใบแพทย์</p>
                </div>
              )}
              {agingCerts.map(c => {
                const daysOver = Math.floor((new Date().getTime() - new Date(c.cert_deadline).getTime()) / 86400000)
                return (
                  <div key={c.id} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{c.bookings?.customers?.customer_name}</p>
                      <p className="text-xs text-gray-400">{c.bookings?.case_number}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <IconAlertTriangle size={10} /> เกิน {daysOver} วัน
                      </span>
                    </div>
                  </div>
                )
              })}
              {kpi.overdueCerts > 5 && (
                <p className="text-xs text-center text-gray-400 cursor-pointer hover:text-[#185FA5]"
                  onClick={() => window.location.href='/medical'}>
                  ดูทั้งหมด {kpi.overdueCerts} รายการ →
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}