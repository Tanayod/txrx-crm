'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconDownload, IconRefresh, IconCalendar } from '@tabler/icons-react'

export default function DailyReport() {
  const { user, role, ready, logout } = useAuth('/daily-report')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState<any[]>([])
  const [summary, setSummary] = useState({ todayBooked: 0, todayActual: 0, tomorrowBooked: 0, tomorrowActual: 0 })

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
      .select('*, customers(customer_name), medical_cases(actual_count, exam_date), payments(payment_status, amount_received)')
      .gte('booking_date', dateFrom)
      .lte('booking_date', dateTo)
      .order('booking_date', { ascending: true })
      .order('shift', { ascending: true })

    if (data) {
      setBookings(data)
      const todayData = data.filter(b => b.booking_date === today)
      const tomorrowData = data.filter(b => b.booking_date === tomorrow)
      setSummary({
        todayBooked: todayData.reduce((s,b) => s + (b.booked_count || 0), 0),
        todayActual: todayData.reduce((s,b) => s + ((Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)?.actual_count || 0), 0),
        tomorrowBooked: tomorrowData.reduce((s,b) => s + (b.booked_count || 0), 0),
        tomorrowActual: tomorrowData.reduce((s,b) => s + ((Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)?.actual_count || 0), 0),
      })
    }
    setLoading(false)
  }

  const getMc = (b: any) => Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases

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
      'สถานที่': b.location_name || '',
      'Type': b.service_type || '',
      'เวลา': b.exam_time || '',
      'ยอดจอง': b.booked_count || 0,
      'ยอดตรวจจริง': getMc(b)?.actual_count ?? '',
      'สถานะเงิน': b.payments?.[0]?.payment_status || 'ยังไม่ชำระ',
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

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
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

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex items-end gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <span className="text-gray-400 text-sm pb-2">ถึง</span>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <button onClick={fetchReport}
              className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2 transition-colors">
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
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">กะ</label>
              <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>เช้า</option><option>บ่าย</option><option>เย็น</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>ตรวจนอกสถานที่ (Mobile)</option>
                <option>คลินิก</option><option>Walk-in</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานที่</label>
              <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-50">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (min)</label>
              <input type="number" value={filterBookedMin} onChange={(e) => setFilterBookedMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (max)</label>
              <input type="number" value={filterBookedMax} onChange={(e) => setFilterBookedMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนตรวจจริง</label>
              <select value={filterHasActual} onChange={(e) => setFilterHasActual(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="มี">มีแล้ว</option>
                <option value="ไม่มี">ยังไม่มี</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (min)</label>
              <input type="number" value={filterActualMin} onChange={(e) => setFilterActualMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (max)</label>
              <input type="number" value={filterActualMax} onChange={(e) => setFilterActualMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
            <button onClick={clearFilters} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1"><IconCalendar size={11}/>ยอดจองวันนี้</p>
            <p className="text-2xl font-bold text-[#185FA5]">{summary.todayBooked.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1">ยอดตรวจวันนี้</p>
            <p className="text-2xl font-bold text-emerald-600">{summary.todayActual.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1">ยอดจองพรุ่งนี้</p>
            <p className="text-2xl font-bold text-gray-700">{summary.tomorrowBooked.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">คน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 font-medium mb-1">ยอดตรวจพรุ่งนี้</p>
            <p className="text-2xl font-bold text-gray-700">{summary.tomorrowActual.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">คน</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-9 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span className="col-span-2">ลูกค้า</span><span>กะ</span><span className="col-span-2">สถานที่</span>
            <span>Type</span><span>เวลา</span><span>ยอดจอง</span><span>ยอดตรวจ</span>
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
            const isToday = date === today
            const isTomorrow = date === tomorrow
            return (
              <div key={date}>
                <div className={`px-5 py-2.5 flex justify-between items-center border-b border-gray-100 ${isToday ? 'bg-blue-50' : isTomorrow ? 'bg-amber-50' : 'bg-gray-50/50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isToday ? 'text-[#185FA5]' : isTomorrow ? 'text-amber-600' : 'text-gray-700'}`}>
                      {new Date(date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    {isToday && <span className="text-xs bg-[#185FA5] text-white px-2 py-0.5 rounded-full">วันนี้</span>}
                    {isTomorrow && <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full">พรุ่งนี้</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">จอง: <span className="font-bold text-gray-700">{dayBooked}</span></span>
                    <span className="text-xs text-gray-500">ตรวจจริง: <span className="font-bold text-emerald-600">{dayActual}</span></span>
                  </div>
                </div>
                {dayBookings.map((b: any) => {
                  const actual = getMc(b)?.actual_count
                  return (
                    <div key={b.id} className="grid grid-cols-9 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-blue-50/20 transition-colors items-center">
                      <span className="col-span-2 font-medium text-gray-800 text-xs">{b.customers?.customer_name}</span>
                      <span className="text-xs">
                        <span className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${b.shift === 'เช้า' ? 'bg-yellow-50 text-yellow-700' : b.shift === 'บ่าย' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'}`}>
                          {b.shift}
                        </span>
                      </span>
                      <span className="col-span-2 text-gray-500 text-xs truncate">{b.location_name || '-'}</span>
                      <span className="text-xs text-gray-500">{b.service_type?.replace('ตรวจนอกสถานที่ (Mobile)', 'Mobile') || '-'}</span>
                      <span className="text-xs text-gray-500">{b.exam_time || '-'}</span>
                      <span className="text-xs font-medium text-gray-700">{b.booked_count || '-'}</span>
                      <span className="text-xs font-bold text-emerald-600">{actual ?? <span className="text-gray-300">-</span>}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {filtered.length > 0 && (
            <div className="grid grid-cols-9 gap-2 px-5 py-3 bg-gray-800 text-xs font-bold text-white">
              <span className="col-span-7">รวมทั้งหมด</span>
              <span>{totalBooked.toLocaleString()}</span>
              <span className="text-emerald-400">{totalActual.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}