'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch, IconEdit, IconTrash, IconDownload, IconCheck, IconClock, IconAlertTriangle } from '@tabler/icons-react'

const provinces = ['กรุงเทพมหานคร','สมุทรสาคร','ชลบุรี','นนทบุรี','ปทุมธานี','ระยอง','ลพบุรี','เชียงใหม่','นครปฐม','สมุทรปราการ','พระนครศรีอยุธยา','ลำพูน','เพชรบูรณ์','อื่นๆ']
const SIM_PACKAGES = ['200', '250', '300']

const emptyForm = {
  customer_id: '', customer_name_display: '',
  booking_date: '', shift: 'เช้า',
  service_type: 'ตรวจนอกสถานที่ (Mobile)',
  province: '', location_name: '', location_url: '',
  exam_time: '', nationality: 'พม่า',
  booked_count: 0, sim_true_status: 'รอคำตอบลูกค้า',
  sim_count: 0, sim_package: '',
  meal_price: 0, meal_count: 0,
  admin_note: ''
}

export default function Bookings() {
  const { user, role, ready, logout } = useAuth('/bookings')
  const [bookings, setBookings] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(emptyForm)

  const getDefaultFrom = () => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0,10)
  }
  const [filterDateFrom, setFilterDateFrom] = useState(getDefaultFrom())
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterShift, setFilterShift] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [filterBookedMin, setFilterBookedMin] = useState('')
  const [filterBookedMax, setFilterBookedMax] = useState('')
  const [filterActualMin, setFilterActualMin] = useState('')
  const [filterActualMax, setFilterActualMax] = useState('')
  const [filterHasActual, setFilterHasActual] = useState('')

  if (ready && !loaded) { fetchAll(); setLoaded(true) }

  async function fetchAll() { fetchBookings(); fetchCustomers(); fetchLocations() }

  async function fetchBookings(dateFrom?: string, dateTo?: string) {
    let all: any[] = []
    let from = 0
    const pageSize = 1000
    const df = dateFrom ?? filterDateFrom
    const dt = dateTo ?? filterDateTo
    while (true) {
      let q = supabase
        .from('bookings')
        .select('*, customers(customer_name), medical_cases(*), payments(*)')
        .order('booking_date', { ascending: false })
      if (df) q = q.gte('booking_date', df)
      if (dt) q = q.lte('booking_date', dt)
      const { data } = await q.range(from, from + pageSize - 1)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < pageSize) break
      from += pageSize
    }
    setBookings(all)
  }

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('customer_name')
    if (data) setCustomers(data)
  }

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').eq('is_active', true).order('name')
    if (data) setLocations(data)
  }

  const generateCaseNumber = () => {
    const d = new Date().toISOString().slice(0,10).replace(/-/g,'')
    const rand = Math.floor(Math.random()*900)+100
    return `TXR-${d}-${rand}`
  }

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setCustomerSearch(''); setShowModal(true) }

  const openEdit = (b: any) => {
    setEditingId(b.id)
    setForm({
      customer_id: b.customer_id, customer_name_display: b.customers?.customer_name || '',
      booking_date: b.booking_date, shift: b.shift, service_type: b.service_type,
      province: b.province || '', location_name: b.location_name || '',
      location_url: b.location_url || '', exam_time: b.exam_time || '',
      nationality: b.nationality || 'พม่า', booked_count: b.booked_count || 0,
      sim_true_status: b.sim_true_status || 'รอคำตอบลูกค้า',
      sim_count: b.sim_count || 0, sim_package: b.sim_package || '',
      meal_price: b.meal_price || 0, meal_count: b.meal_count || 0,
      admin_note: b.admin_note || ''
    })
    setCustomerSearch(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.customer_id || !form.booking_date) return alert('กรุณาเลือกลูกค้าและวันที่')
    setSaving(true)
    const payload = {
      customer_id: form.customer_id, booking_date: form.booking_date,
      shift: form.shift, service_type: form.service_type, province: form.province,
      location_name: form.location_name, location_url: form.location_url,
      exam_time: form.exam_time, nationality: form.nationality,
      booked_count: form.booked_count, sim_true_status: form.sim_true_status,
      sim_count: form.sim_count, sim_package: form.sim_package,
      meal_price: form.meal_price, meal_count: form.meal_count,
      admin_note: form.admin_note,
    }
    if (editingId) {
      await supabase.from('bookings').update(payload).eq('id', editingId)
    } else {
      await supabase.from('bookings').insert([{ ...payload, case_number: generateCaseNumber() }])
    }
    setSaving(false); fetchBookings(); setShowModal(false)
  }

const handleDelete = async () => {
  if (!deleteId) return
  await supabase.from('medical_cases').delete().eq('booking_id', deleteId)
  await supabase.from('payments').delete().eq('booking_id', deleteId)
  await supabase.from('special_exams').delete().eq('booking_id', deleteId)
  await supabase.from('bookings').delete().eq('id', deleteId)
  setDeleteId(null); fetchBookings()
}

  const getPaymentStatus = (b: any) => {
    const p = b.payments?.[0]
    if (!p) return { label: 'ยังไม่ชำระ', color: 'bg-gray-100 text-gray-500' }
    const map: any = {
      'ชำระเงินแล้ว': 'bg-green-100 text-green-700',
      'ยังไม่ชำระ': 'bg-gray-100 text-gray-500',
      'ค้างชำระ': 'bg-red-100 text-red-600',
      'เครดิต': 'bg-amber-100 text-amber-600',
    }
    return { label: p.payment_status, color: map[p.payment_status] || 'bg-gray-100 text-gray-500' }
  }

  const getMedicalStatus = (b: any) => {
    const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
    if (!mc) return { label: 'รอบันทึก', color: 'bg-gray-100 text-gray-400', icon: IconClock }
    if (mc.cert_status === 'เรียบร้อย') return { label: 'ส่งครบ', color: 'bg-green-100 text-green-700', icon: IconCheck }
    if (mc.cert_deadline && new Date() > new Date(mc.cert_deadline)) return { label: 'เกิน 3 วัน!', color: 'bg-red-100 text-red-600', icon: IconAlertTriangle }
    return { label: 'รอส่งใบแพทย์', color: 'bg-amber-100 text-amber-600', icon: IconClock }
  }

  const filteredCustomers = customers.filter(c =>
    c.customer_name?.includes(customerSearch) || c.line_name?.includes(customerSearch)
  )

  const filtered = bookings.filter(b => {
    const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search) && !b.location_name?.includes(search)) return false
    if (filterDateFrom && b.booking_date < filterDateFrom) return false
    if (filterDateTo && b.booking_date > filterDateTo) return false
    if (filterShift && b.shift !== filterShift) return false
    if (filterService && b.service_type !== filterService) return false
    if (filterLocation && b.location_name !== filterLocation) return false
    if (filterPayment && getPaymentStatus(b).label !== filterPayment) return false
    if (filterBookedMin && b.booked_count < Number(filterBookedMin)) return false
    if (filterBookedMax && b.booked_count > Number(filterBookedMax)) return false
    if (filterActualMin && (mc?.actual_count ?? -1) < Number(filterActualMin)) return false
    if (filterActualMax && (mc?.actual_count ?? 99999) > Number(filterActualMax)) return false
    if (filterHasActual === 'มี' && !(mc?.actual_count > 0)) return false
    if (filterHasActual === 'ไม่มี' && mc?.actual_count > 0) return false
    return true
  })

  const exportExcel = () => {
    const rows = filtered.map(b => {
      const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
      const p = b.payments?.[0]
      return {
        'เลขจอง': b.case_number,
        'ลูกค้า': b.customers?.customer_name,
        'วันที่': b.booking_date,
        'กะ': b.shift,
        'ประเภทบริการ': b.service_type,
        'สถานที่': b.location_name,
        'จำนวนจอง': b.booked_count,
        'จำนวนตรวจจริง': mc?.actual_count || '',
        'ซิมที่ขาย': b.sim_count || 0,
        'แพ็กเกจซิม': b.sim_package || '',
        'สถานะเงิน': p?.payment_status || 'ยังไม่ชำระ',
        'สถานะใบแพทย์': getMedicalStatus(b).label,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
    XLSX.writeFile(wb, `bookings_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const clearFilters = () => {
    setSearch(''); setFilterDateFrom(getDefaultFrom()); setFilterDateTo(''); setFilterShift('')
    setFilterService(''); setFilterLocation(''); setFilterPayment('')
    setFilterBookedMin(''); setFilterBookedMax('')
    setFilterActualMin(''); setFilterActualMax(''); setFilterHasActual('')
    fetchBookings(getDefaultFrom(), '')
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/bookings" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">

        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-semibold text-gray-800">จองคิว</p>
            <p className="text-xs text-gray-400 mt-0.5">รายการจองทั้งหมด · {filtered.length} รายการ</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
              <IconDownload size={15}/> Export
            </button>
            <button onClick={openCreate} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2 transition-colors">
              <IconPlus size={16}/> จองคิวใหม่
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400"/>
              <input type="text" placeholder="ค้นหาลูกค้า เลขจอง หรือสถานที่..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchBookings()}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <button onClick={() => fetchBookings()}
              className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] transition-colors flex-shrink-0">
              ค้นหา
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
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
              <label className="text-xs text-gray-400 mb-1 block">ประเภทบริการ</label>
              <select value={filterService} onChange={(e) => setFilterService(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>ตรวจนอกสถานที่ (Mobile)</option>
                <option>คลินิก</option><option>Walk-in</option>
                <option>ไฟล์ทบิน</option>
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
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานะชำระ</label>
              <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>ชำระเงินแล้ว</option><option>ยังไม่ชำระ</option>
                <option>ค้างชำระ</option><option>เครดิต</option>
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
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-400">พบ <span className="font-semibold text-gray-600">{filtered.length}</span> รายการ</p>
            <button onClick={clearFilters} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-10 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span>เลขจอง</span><span className="col-span-2">ลูกค้า</span><span>วันที่</span>
            <span>สถานที่</span><span>จอง/จริง</span><span>ซิม</span>
            <span>สถานะเงิน</span><span>ใบแพทย์</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-300 text-4xl mb-2">📋</p>
              <p className="text-sm text-gray-400">ไม่พบรายการ</p>
            </div>
          ) : filtered.map((b) => {
            const payStatus = getPaymentStatus(b)
            const medStatus = getMedicalStatus(b)
            const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
            return (
              <div key={b.id} className="border-b border-gray-50">
                <div
                  className="grid grid-cols-10 gap-2 px-5 py-3.5 text-sm hover:bg-blue-50/30 transition-colors items-center cursor-pointer"
                  onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                >
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <span className="col-span-2 font-medium text-gray-800 text-xs">{b.customers?.customer_name}</span>
                  <span className="text-gray-500 text-xs">{b.booking_date}</span>
                  <span className="text-gray-500 text-xs truncate">{b.location_name || '-'}</span>
                  <span className="text-xs">
                    <span className="text-gray-700">{b.booked_count || 0}</span>
                    <span className="text-gray-300 mx-0.5">/</span>
                    <span className="text-[#185FA5] font-semibold">{mc?.actual_count ?? '-'}</span>
                  </span>
                  <span className="text-xs">
                    {b.sim_count > 0 ? (
                      <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md font-medium">
                        {b.sim_count} ซิม {b.sim_package ? `(฿${b.sim_package})` : ''}
                      </span>
                    ) : <span className="text-gray-300">-</span>}
                  </span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${payStatus.color}`}>{payStatus.label}</span></span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium ${medStatus.color}`}>
                    <medStatus.icon size={10}/>{medStatus.label}
                  </span></span>
                  <span className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(b)} className="text-gray-300 hover:text-blue-500 transition-colors"><IconEdit size={15}/></button>
                    <button onClick={() => setDeleteId(b.id)} className="text-gray-300 hover:text-red-500 transition-colors"><IconTrash size={15}/></button>
                  </span>
                </div>
                {expandedId === b.id && (
                  <div className="px-5 pb-4 pt-3 bg-blue-50/40 border-t border-blue-100">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">ประเภทบริการ</p>
                        <p className="text-xs font-medium text-gray-700">{b.service_type || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">กะ</p>
                        <p className="text-xs font-medium text-gray-700">{b.shift || '-'}</p>
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
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">ซิมทรู</p>
                        <p className="text-xs font-medium text-gray-700">{b.sim_true_status || '-'}</p>
                      </div>
                      {b.service_type === 'ไฟล์ทบิน' && b.meal_price > 0 && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-400 mb-0.5">ค่าข้าวไฟล์ทบิน</p>
                          <p className="text-xs font-medium text-sky-600">฿{b.meal_price} × {b.meal_count} มื้อ × {b.booked_count} คน = ฿{(b.meal_price * b.meal_count * b.booked_count).toLocaleString()}</p>
                        </div>
                      )}
                      {b.location_url && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Google Map</p>
                          <a href={b.location_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-[#185FA5] hover:underline flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                            </svg>
                            เปิด Google Map
                          </a>
                        </div>
                      )}
                      {b.admin_note && (
                        <div className="col-span-4">
                          <p className="text-xs text-gray-400 mb-0.5">หมายเหตุ</p>
                          <p className="text-xs text-gray-600 bg-white rounded-lg px-3 py-2 border border-gray-100">{b.admin_note}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <p className="text-base font-semibold text-gray-800">{editingId ? 'แก้ไขรายการจอง' : 'จองคิวใหม่'}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ลูกค้า *</label>
                <input value={form.customer_name_display || customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); setForm({...form, customer_id:'', customer_name_display:''}) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="พิมพ์ค้นหาลูกค้า..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-40 overflow-y-auto mt-1">
                    {filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => { setForm({...form, customer_id: c.id, customer_name_display: c.customer_name}); setCustomerSearch(''); setShowCustomerDropdown(false) }}
                        className="px-3 py-2.5 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-800">{c.customer_name}</span>
                        {c.line_name && <span className="text-gray-400 ml-2 text-xs">{c.line_name}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">วันที่ตรวจ *</label>
                  <input type="date" value={form.booking_date} onChange={(e) => setForm({...form, booking_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">กะ</label>
                  <select value={form.shift} onChange={(e) => setForm({...form, shift: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option>เช้า</option><option>บ่าย</option><option>เย็น</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ประเภทบริการ</label>
                <select value={form.service_type} onChange={(e) => setForm({...form, service_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option>ตรวจนอกสถานที่ (Mobile)</option>
                  <option>คลินิก</option><option>Walk-in</option>
                  <option>ไฟล์ทบิน</option>
                </select>
              </div>
              {form.service_type === 'ไฟล์ทบิน' && (
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-sky-700 mb-3">✈️ ค่าข้าวไฟล์ทบิน</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1.5 block">ค่าข้าว (บาท/มื้อ)</label>
                      <input type="text" inputMode="numeric" value={form.meal_price || ''}
                        onChange={(e) => setForm({...form, meal_price: Number(e.target.value.replace(/\D/g,''))})}
                        placeholder="0"
                        className="w-full border border-sky-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1.5 block">จำนวนมื้อ</label>
                      <input type="text" inputMode="numeric" value={form.meal_count || ''}
                        onChange={(e) => setForm({...form, meal_count: Number(e.target.value.replace(/\D/g,''))})}
                        placeholder="0"
                        className="w-full border border-sky-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
                    </div>
                  </div>
                  {form.meal_price > 0 && form.meal_count > 0 && (
                    <p className="text-xs text-sky-600 mt-2 font-medium">
                      รวมค่าข้าว: ฿{(form.meal_price * form.meal_count * (form.booked_count || 1)).toLocaleString()}
                      <span className="text-sky-400 ml-1">({form.meal_price} × {form.meal_count} มื้อ × {form.booked_count || 1} คน)</span>
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">จังหวัด</label>
                  <select value={form.province} onChange={(e) => setForm({...form, province: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option value="">เลือกจังหวัด</option>
                    {provinces.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">สัญชาติ</label>
                  <select value={form.nationality} onChange={(e) => setForm({...form, nationality: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option>พม่า</option><option>กัมพูชา</option>
                    <option>ลาว</option><option>เวียดนาม</option><option>อื่นๆ</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ชื่อสถานที่</label>
                <select value={form.location_name} onChange={(e) => setForm({...form, location_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="">เลือกสถานที่</option>
                  {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ลิ้งค์ Google Map</label>
                <input value={form.location_url} onChange={(e) => setForm({...form, location_url: e.target.value})}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">เวลา</label>
                  <input value={form.exam_time} onChange={(e) => setForm({...form, exam_time: e.target.value})}
                    placeholder="8.00น.-12.00น."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">จำนวนจอง (คน)</label>
                  <input type="text" inputMode="numeric" value={form.booked_count || ''}
                    onChange={(e) => setForm({...form, booked_count: Number(e.target.value.replace(/\D/g,''))})}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ซิมทรู</label>
                <select value={form.sim_true_status} onChange={(e) => setForm({...form, sim_true_status: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option>แจ้งหรือแล้ว</option><option>คำกล่าวประสาน</option>
                  <option>รอคำตอบลูกค้า</option><option>อนุญาต</option>
                  <option>ไม่อนุญาต</option><option>walk-in คลินิก</option>
                </select>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-purple-700 mb-3">📱 ซิมที่ขาย</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">จำนวนซิม</label>
                    <input type="text" inputMode="numeric" value={form.sim_count || ''}
                      onChange={(e) => setForm({...form, sim_count: Number(e.target.value.replace(/\D/g,''))})}
                      placeholder="0"
                      className="w-full border border-purple-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">แพ็กเกจ (บาท/เดือน)</label>
                    <select value={form.sim_package} onChange={(e) => setForm({...form, sim_package: e.target.value})}
                      className="w-full border border-purple-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                      <option value="">ไม่ระบุ</option>
                      {SIM_PACKAGES.map(p => <option key={p} value={p}>฿{p}/เดือน</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">หมายเหตุ</label>
                <textarea value={form.admin_note} onChange={(e) => setForm({...form, admin_note: e.target.value})} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50 transition-colors font-medium">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <p className="text-base font-semibold text-gray-800 mb-2">ยืนยันการลบ</p>
            <p className="text-sm text-gray-500 mb-5">ต้องการลบรายการจองนี้ใช่ไหม?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}