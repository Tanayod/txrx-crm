'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconDownload, IconRefresh, IconCalendar, IconDeviceMobile, IconMicroscope } from '@tabler/icons-react'

export default function DailyReport() {
  const { user, role, ready, logout } = useAuth('/daily-report')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState<any[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [summary, setSummary] = useState({ 
    todayBooked: 0, todayActual: 0, todaySim: 0, todaySpecial: 0,
    tomorrowBooked: 0, tomorrowActual: 0, tomorrowSim: 0, tomorrowSpecial: 0 
  })

  const today = new Date().toISOString().slice(0,10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(tomorrow)

  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterShift, setFilterShift] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterBookedMin, setFilterBookedMin] = useState('')
  const [filterBookedMax, setFilterBookedMax] = useState('')
  const [filterActualMin, setFilterActualMin] = useState('')
  const [filterActualMax, setFilterActualMax] = useState('')
  const [filterHasActual, setFilterHasActual] = useState('')
  const [locations, setLocations] = useState<any[]>([])

  if (ready && !loaded) { fetchReport(); fetchLocations(); setLoaded(true) }

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').eq('is_active', true).order('name')
    if (data) setLocations(data)
  }

  async function fetchReport() {
    setLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(customer_name), medical_cases(actual_count, exam_date, doctor_note, cert_count, hold_count, cert_status, cert_deadline, parcel_sent), payments(payment_status, amount_received), special_exams(*, special_exam_items(*))')
      .gte('booking_date', dateFrom)
      .lte('booking_date', dateTo)
      .order('booking_date', { ascending: true })
      .order('shift', { ascending: true })

    if (data) {
      setBookings(data)
      const todayData = data.filter(b => b.booking_date === today)
      const tomorrowData = data.filter(b => b.booking_date === tomorrow)

      const getSpCount = (b: any) => b.special_exams?.reduce((s: number, e: any) => s + (e.total_workers || 0), 0) || 0

      setSummary({
        todayBooked: todayData.reduce((s,b) => s + (b.booked_count || 0), 0),
        todayActual: todayData.reduce((s,b) => s + ((Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)?.actual_count || 0), 0),
        todaySim: todayData.reduce((s,b) => s + (b.sim_count || 0), 0),
        todaySpecial: todayData.reduce((s,b) => s + getSpCount(b), 0),
        tomorrowBooked: tomorrowData.reduce((s,b) => s + (b.booked_count || 0), 0),
        tomorrowActual: tomorrowData.reduce((s,b) => s + ((Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)?.actual_count || 0), 0),
        tomorrowSim: tomorrowData.reduce((s,b) => s + (b.sim_count || 0), 0),
        tomorrowSpecial: tomorrowData.reduce((s,b) => s + getSpCount(b), 0),
      })
    }
    setLoading(false)
  }

  const getMc = (b: any) => Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
  const getSpCount = (b: any) => b.special_exams?.reduce((s: number, e: any) => s + (e.total_workers || 0), 0) || 0

  const availableTypes = Array.from(new Set(bookings.map(b => b.service_type).filter(Boolean))).sort()

  const filtered = bookings.filter(b => {
    const mc = getMc(b)
    if (filterCustomer && !b.customers?.customer_name?.includes(filterCustomer)) return false
    if (filterShift && b.shift !== filterShift) return false
    if (filterType && b.service_type !== filterType) return false
    if (filterLocation && b.location_name !== filterLocation) return false
    if (filterBookedMin && b.booked_count < Number(filterBookedMin)) return false
    if (filterBookedMax && b.booked_count > Number(filterBookedMax)) return false
    if (filterActualMin && (mc?.actual_count ?? -1) < Number(filterActualMin)) return false
    if (filterActualMax && (mc?.actual_count ?? 99999) > Number(filterActualMax)) return false
    if (filterHasActual === 'มี' && !(mc?.actual_count > 0)) return false
    if (filterHasActual === 'ไม่มี' && mc?.actual_count > 0) return false
    return true
  })

  const totalBooked = filtered.reduce((s,b) => s + (b.booked_count || 0), 0)
  const totalActual = filtered.reduce((s,b) => s + (getMc(b)?.actual_count || 0), 0)
  const totalSpecial = filtered.reduce((s,b) => s + getSpCount(b), 0)
  const totalSim = filtered.reduce((s,b) => s + (b.sim_count || 0), 0)

  const grouped: any = {}
  filtered.forEach(b => {
    const d = b.booking_date
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(b)
  })

  const exportExcel = () => {
    const rows = filtered.map(b => ({
      'วันที่': b.booking_date,
      'กะ': b.shift,
      'ชื่อลูกค้า': b.customers?.customer_name,
      'สถานที่': b.location_name || b.province || '',
      'จังหวัด': b.province || '',
      'Type': b.service_type || '',
      'เวลา': b.exam_time || '',
      'สัญชาติ': b.nationality || '',
      'ยอดจอง': b.booked_count || 0,
      'ยอดตรวจจริง': getMc(b)?.actual_count ?? '',
      'ยอดตรวจพิเศษ': getSpCount(b),
      'รายการตรวจพิเศษ': (b.special_exams || []).flatMap((s: any) => (s.special_exam_items || []).filter((i: any) => (i.quantity || 0) > 0).map((i: any) => `${i.exam_name}×${i.quantity}`)).join(', '),
      'ยอดซิม': b.sim_count || 0,
      'ซิมทรู': b.sim_true_status || '',
      'สถานะเงิน': b.payments?.[0]?.payment_status || 'ยังไม่ชำระ',
      'ยอดชำระ': b.payments?.[0]?.amount_received ?? '',
      'หมายเหตุแอดมิน': b.admin_note || '',
      'หมายเหตุทีมแพทย์': getMc(b)?.doctor_note || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report')
    XLSX.writeFile(wb, `daily_report_${dateFrom}_${dateTo}.xlsx`)
  }

  const clearFilters = () => {
    setFilterCustomer(''); setFilterShift(''); setFilterType(''); setFilterLocation('')
    setFilterBookedMin(''); setFilterBookedMax('')
    setFilterActualMin(''); setFilterActualMax(''); setFilterHasActual('')
  }

  if (!ready) return <div className="min-h-screen bg-[#F6F7FB] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F6F7FB]">
      <Sidebar user={user} role={role} currentPath="/daily-report" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">

        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-semibold text-gray-800">รายงานการจองรายวัน</p>
            <p className="text-xs text-gray-400 mt-0.5">Daily Booking Report</p>
          </div>
          <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
            <IconDownload size={15}/> Export Excel
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex items-end gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
            <span className="text-gray-400 text-sm pb-2">ถึง</span>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
            <button onClick={fetchReport}
              className="bg-[#4338CA] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#312E81] flex items-center gap-2 transition-colors">
              <IconRefresh size={14}/> ดึงข้อมูล
            </button>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => { setDateFrom(today); setDateTo(today) }}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">วันนี้</button>
              <button onClick={() => { setDateFrom(today); setDateTo(tomorrow) }}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">วันนี้ + พรุ่งนี้</button>
              <button onClick={() => {
                const mon = new Date(); mon.setDate(mon.getDate() - mon.getDay() + 1)
                const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
                setDateFrom(mon.toISOString().slice(0,10)); setDateTo(sun.toISOString().slice(0,10))
              }} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">สัปดาห์นี้</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ชื่อลูกค้า</label>
              <input type="text" placeholder="ค้นหา..." value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">กะ</label>
              <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
                <option value="">ทั้งหมด</option>
                <option>เช้า</option><option>บ่าย</option><option>เย็น</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
                <option value="">ทั้งหมด</option>
                {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานที่</label>
              <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
                <option value="">ทั้งหมด</option>
                {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-50">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (min)</label>
              <input type="number" value={filterBookedMin} onChange={(e) => setFilterBookedMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (max)</label>
              <input type="number" value={filterBookedMax} onChange={(e) => setFilterBookedMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนตรวจจริง</label>
              <select value={filterHasActual} onChange={(e) => setFilterHasActual(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
                <option value="">ทั้งหมด</option>
                <option value="มี">มีแล้ว</option>
                <option value="ไม่มี">ยังไม่มี</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (min)</label>
              <input type="number" value={filterActualMin} onChange={(e) => setFilterActualMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (max)</label>
              <input type="number" value={filterActualMax} onChange={(e) => setFilterActualMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
            </div>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
            <button onClick={clearFilters} className="text-xs text-[#4338CA] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        {/* 🔹 Banner Summary เพิ่มตรวจพิเศษ */}
        <div className="grid grid-cols-8 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1"><IconCalendar size={11}/>ยอดจองวันนี้</p>
            <p className="text-xl font-bold text-[#4338CA]">{summary.todayBooked.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1">ยอดตรวจวันนี้</p>
            <p className="text-xl font-bold text-emerald-600">{summary.todayActual.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1"><IconMicroscope size={11}/>ตรวจพิเศษวันนี้</p>
            <p className="text-xl font-bold text-purple-600">{summary.todaySpecial.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1"><IconDeviceMobile size={11}/>ซิมวันนี้</p>
            <p className="text-xl font-bold text-sky-600">{summary.todaySim.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">ซิม</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1">ยอดจองพรุ่งนี้</p>
            <p className="text-xl font-bold text-gray-700">{summary.tomorrowBooked.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1">ยอดตรวจพรุ่งนี้</p>
            <p className="text-xl font-bold text-gray-700">{summary.tomorrowActual.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1"><IconMicroscope size={11}/>ตรวจพิเศษพรุ่งนี้</p>
            <p className="text-xl font-bold text-purple-600">{summary.tomorrowSpecial.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1"><IconDeviceMobile size={11}/>ซิมพรุ่งนี้</p>
            <p className="text-xl font-bold text-gray-700">{summary.tomorrowSim.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">ซิม</p>
          </div>
        </div>

        {/* 🔹 Table สรุป */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-11 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span className="col-span-2">ลูกค้า</span><span>กะ</span><span className="col-span-2">สถานที่</span>
            <span>Type</span><span>เวลา</span><span>ยอดจอง</span><span>ยอดตรวจ</span><span>ตรวจพิเศษ</span><span>ยอดซิม</span>
          </div>

          {loading ? (
            <div className="p-12 text-center"><p className="text-sm text-gray-400">กำลังโหลด...</p></div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-300 text-4xl mb-2">📅</p>
              <p className="text-sm text-gray-400">ไม่พบรายการในช่วงที่เลือก</p>
            </div>
          ) : Object.keys(grouped).sort().map(date => {
            const dayBookings = grouped[date]
            const dayBooked = dayBookings.reduce((s:number,b:any) => s + (b.booked_count || 0), 0)
            const dayActual = dayBookings.reduce((s:number,b:any) => s + (getMc(b)?.actual_count || 0), 0)
            const daySpecial = dayBookings.reduce((s:number,b:any) => s + getSpCount(b), 0)
            const daySim = dayBookings.reduce((s:number,b:any) => s + (b.sim_count || 0), 0)
            const isToday = date === today
            const isTomorrow = date === tomorrow
            return (
              <div key={date}>
                <div className={`px-5 py-2.5 flex justify-between items-center border-b border-gray-100 ${isToday ? 'bg-blue-50' : isTomorrow ? 'bg-amber-50' : 'bg-gray-50/50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isToday ? 'text-[#4338CA]' : isTomorrow ? 'text-amber-600' : 'text-gray-700'}`}>
                      {new Date(date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    {isToday && <span className="text-xs bg-[#4338CA] text-white px-2 py-0.5 rounded-full">วันนี้</span>}
                    {isTomorrow && <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full">พรุ่งนี้</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">จอง: <span className="font-bold text-gray-700">{dayBooked}</span></span>
                    <span className="text-xs text-gray-500">ตรวจจริง: <span className="font-bold text-emerald-600">{dayActual}</span></span>
                    <span className="text-xs text-gray-500">ตรวจพิเศษ: <span className="font-bold text-purple-600">{daySpecial}</span></span>
                    <span className="text-xs text-gray-500">ซิม: <span className="font-bold text-sky-600">{daySim}</span></span>
                  </div>
                </div>
                {dayBookings.map((b: any) => {
                  const mc = getMc(b)
                  const actual = mc?.actual_count
                  const spCount = getSpCount(b)
                  const p = b.payments?.[0]
                  const hasNote = !!(b.admin_note || mc?.doctor_note)
                  return (
                    <div key={b.id} className="border-b border-gray-50">
                    <div
                      className="grid grid-cols-11 gap-2 px-5 py-3 text-sm hover:bg-blue-50/20 transition-colors items-center cursor-pointer"
                      onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                    >
                      <span className="col-span-2 font-medium text-gray-800 text-xs flex items-center gap-1">
                        {b.customers?.customer_name}
                        {hasNote && <span title="มีหมายเหตุ" className="text-[11px]">📝</span>}
                      </span>
                      <span className="text-xs">
                        <span className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${b.shift === 'เช้า' ? 'bg-yellow-50 text-yellow-700' : b.shift === 'บ่าย' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'}`}>
                          {b.shift}
                        </span>
                      </span>
                      <span className="col-span-2 text-gray-500 text-xs truncate">{b.location_name || b.province || '-'}</span>
                      <span className="text-xs text-gray-500">{b.service_type?.replace('ตรวจนอกสถานที่ (Mobile)', 'Mobile') || '-'}</span>
                      <span className="text-xs text-gray-500">{b.exam_time || '-'}</span>
                      <span className="text-xs font-medium text-gray-700">{b.booked_count || '-'}</span>
                      <span className="text-xs font-bold text-emerald-600">{actual ?? <span className="text-gray-300">-</span>}</span>
                      <span className="text-xs font-bold text-purple-600">{spCount > 0 ? spCount : <span className="text-gray-300">-</span>}</span>
                      <span className="text-xs font-bold text-sky-600">{b.sim_count > 0 ? b.sim_count : <span className="text-gray-300">-</span>}</span>
                    </div>

                    {expandedId === b.id && (
                      <div className="px-5 pb-4 pt-3 bg-blue-50/30 border-t border-blue-100">
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">ประเภทบริการ</p>
                            <p className="text-xs font-medium text-gray-700">{b.service_type || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">เวลา</p>
                            <p className="text-xs font-medium text-gray-700">{b.exam_time || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">สัญชาติ</p>
                            <p className="text-xs font-medium text-gray-700">{b.nationality || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">จังหวัด</p>
                            <p className="text-xs font-medium text-gray-700">{b.province || '-'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-gray-400 mb-0.5">สถานที่</p>
                            <p className="text-xs font-medium text-gray-700">
                              {b.location_name || '-'}
                              {b.location_url && (
                                <a href={b.location_url} target="_blank" rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[#4338CA] hover:underline ml-2">เปิด Google Map</a>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">ซิมทรู</p>
                            <p className="text-xs font-medium text-gray-700">{b.sim_true_status || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">สถานะเงิน</p>
                            <p className="text-xs font-medium text-gray-700">
                              {p?.payment_status || 'ยังไม่ชำระ'}
                              {p?.amount_received ? <span className="text-gray-400"> · รับแล้ว ฿{Number(p.amount_received).toLocaleString()}</span> : null}
                            </p>
                          </div>
                          {b.admin_note && (
                            <div className="col-span-4">
                              <p className="text-xs text-gray-400 mb-0.5">หมายเหตุ (แอดมิน)</p>
                              <p className="text-xs text-gray-600 bg-white rounded-lg px-3 py-2 border border-gray-100">{b.admin_note}</p>
                            </div>
                          )}
                          {mc?.doctor_note && (
                            <div className="col-span-4">
                              <p className="text-xs text-gray-400 mb-0.5">หมายเหตุ (ทีมแพทย์)</p>
                              <p className="text-xs text-gray-600 bg-white rounded-lg px-3 py-2 border border-gray-100">{mc.doctor_note}</p>
                            </div>
                          )}
                        </div>

                        {b.special_exams && b.special_exams.length > 0 && (
                          <div className="mt-3 bg-white rounded-lg border border-purple-100 overflow-hidden">
                            <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 border-b border-purple-100">
                              <IconMicroscope size={13} className="text-purple-600"/>
                              <p className="text-xs font-semibold text-purple-700">ตรวจพิเศษที่ผูกไว้ · {b.special_exams.length} รายการ</p>
                            </div>
                            {b.special_exams.map((sp: any) => {
                              const spItems = (sp.special_exam_items || []).filter((i: any) => (i.quantity || 0) > 0)
                              return (
                                <div key={sp.id} className="px-3 py-2.5 border-b border-gray-50 last:border-0">
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs mb-1.5">
                                    <span className="text-gray-500">วันที่ <span className="font-medium text-gray-700">{sp.exam_date || '-'}</span></span>
                                    <span className="text-gray-500">แรงงาน <span className="font-medium text-gray-700">{sp.total_workers || 0} คน</span></span>
                                    <span className="text-gray-500">ยอดรวม <span className="font-semibold text-[#4338CA]">฿{(sp.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></span>
                                  </div>
                                  {spItems.length === 0 ? (
                                    <p className="text-xs text-gray-400">ยังไม่ได้ระบุรายการตรวจย่อย</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {spItems.map((it: any) => (
                                        <span key={it.id} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
                                          {it.exam_name} ×{it.quantity}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {sp.note && <p className="text-xs text-gray-500 mt-1.5">หมายเหตุ: {sp.note}</p>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {filtered.length > 0 && (
            <div className="grid grid-cols-11 gap-2 px-5 py-3 bg-gray-800 text-xs font-bold text-white">
              <span className="col-span-7">รวมทั้งหมด</span>
              <span>{totalBooked.toLocaleString()}</span>
              <span className="text-emerald-400">{totalActual.toLocaleString()}</span>
              <span className="text-purple-300">{totalSpecial.toLocaleString()}</span>
              <span className="text-sky-400">{totalSim.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}