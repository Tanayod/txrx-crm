'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch, IconEdit, IconTrash, IconDownload, IconCheck, IconClock, IconAlertTriangle } from '@tabler/icons-react'

const provinces = ['กรุงเทพมหานคร','สมุทรสาคร','ชลบุรี','นนทบุรี','ปทุมธานี','ระยอง','ลพบุรี','เชียงใหม่','นครปฐม','สมุทรปราการ','พระนครศรีอยุธยา','ลำพูน','เพชรบูรณ์','อื่นๆ']

const emptyForm = {
  customer_id: '', customer_name_display: '',
  booking_date: '', shift: 'เช้า',
  service_type: 'ตรวจนอกสถานที่ (Mobile)',
  province: '', location_name: '', location_url: '',
  exam_time: '', nationality: 'พม่า',
  booked_count: 0, sim_true_status: 'รอคำตอบลูกค้า',
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
  const [form, setForm] = useState<any>(emptyForm)

  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterShift, setFilterShift] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterPayment, setFilterPayment] = useState('')

  if (ready && !loaded) { fetchAll(); setLoaded(true) }

  async function fetchAll() { fetchBookings(); fetchCustomers(); fetchLocations() }

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(customer_name), medical_cases(*), payments(*)')
      .order('booking_date', { ascending: false })
    if (data) setBookings(data)
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
      sim_true_status: b.sim_true_status || 'รอคำตอบลูกค้า', admin_note: b.admin_note || ''
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
    await supabase.from('bookings').delete().eq('id', deleteId)
    setDeleteId(null); fetchBookings()
  }

  const getPaymentStatus = (b: any) => {
    const p = b.payments?.[0]
    if (!p) return { label: 'ยังไม่ชำระ', color: 'bg-gray-100 text-gray-500' }
    const map: any = {
      'ชำระเงินแล้ว': 'bg-green-50 text-green-600',
      'ยังไม่ชำระ': 'bg-gray-100 text-gray-500',
      'ค้างชำระ': 'bg-red-50 text-red-600',
      'เครดิต': 'bg-amber-50 text-amber-600',
    }
    return { label: p.payment_status, color: map[p.payment_status] || 'bg-gray-100 text-gray-500' }
  }

  const getMedicalStatus = (b: any) => {
    const mc = b.medical_cases?.[0]
    if (!mc) return { label: 'รอบันทึก', color: 'bg-gray-100 text-gray-400', icon: IconClock }
    if (mc.cert_status === 'เรียบร้อย') return { label: 'ส่งครบแล้ว', color: 'bg-green-50 text-green-600', icon: IconCheck }
    if (mc.cert_deadline && new Date() > new Date(mc.cert_deadline)) return { label: 'เกิน 3 วัน!', color: 'bg-red-50 text-red-600', icon: IconAlertTriangle }
    return { label: 'รอส่งใบแพทย์', color: 'bg-amber-50 text-amber-600', icon: IconClock }
  }

  const filteredCustomers = customers.filter(c =>
    c.customer_name?.includes(customerSearch) || c.line_name?.includes(customerSearch)
  )

  const filtered = bookings.filter(b => {
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search) && !b.location_name?.includes(search)) return false
    if (filterDateFrom && b.booking_date < filterDateFrom) return false
    if (filterDateTo && b.booking_date > filterDateTo) return false
    if (filterShift && b.shift !== filterShift) return false
    if (filterService && b.service_type !== filterService) return false
    if (filterLocation && b.location_name !== filterLocation) return false
    if (filterPayment && getPaymentStatus(b).label !== filterPayment) return false
    return true
  })

  const exportExcel = () => {
    const rows = filtered.map(b => {
      const mc = b.medical_cases?.[0]
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
        'สถานะเงิน': p?.payment_status || 'ยังไม่ชำระ',
        'สถานะใบแพทย์': getMedicalStatus(b).label,
        'หมายเหตุ': b.admin_note,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
    XLSX.writeFile(wb, `bookings_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/bookings" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">จองคิว</p>
            <p className="text-xs text-gray-400 mt-0.5">รายการจองทั้งหมด</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <IconDownload size={15} /> Export Excel
            </button>
            <button onClick={openCreate} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2">
              <IconPlus size={16} /> จองคิวใหม่
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
          <div className="relative">
            <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input type="text" placeholder="ค้นหาลูกค้า เลขจอง หรือสถานที่..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
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
              <label className="text-xs text-gray-400 mb-1 block">สถานะการชำระ</label>
              <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>ชำระเงินแล้ว</option><option>ยังไม่ชำระ</option>
                <option>ค้างชำระ</option><option>เครดิต</option>
              </select>
            </div>
          </div>
          <div className="flex justify-between items-center pt-1">
            <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
            <button onClick={() => { setSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterShift(''); setFilterService(''); setFilterLocation(''); setFilterPayment('') }}
              className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-9 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่</span>
            <span>สถานที่</span><span>จอง</span><span>ตรวจจริง</span>
            <span>สถานะเงิน</span><span>ใบแพทย์</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>
          ) : (
            filtered.map((b) => {
              const payStatus = getPaymentStatus(b)
              const medStatus = getMedicalStatus(b)
              const mc = b.medical_cases?.[0]
              return (
                <div key={b.id} className="grid grid-cols-9 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <span className="font-medium text-gray-700 text-xs">{b.customers?.customer_name}</span>
                  <span className="text-gray-500 text-xs">{b.booking_date}</span>
                  <span className="text-gray-500 text-xs">{b.location_name || '-'}</span>
                  <span className="text-gray-700 text-xs">{b.booked_count?.toLocaleString()}</span>
                  <span className="text-[#185FA5] font-medium text-xs">{mc?.actual_count?.toLocaleString() || '-'}</span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full ${payStatus.color}`}>{payStatus.label}</span></span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${medStatus.color}`}>
                    <medStatus.icon size={10} />{medStatus.label}
                  </span></span>
                  <span className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(b)} className="text-gray-400 hover:text-blue-500"><IconEdit size={15} /></button>
                    <button onClick={() => setDeleteId(b.id)} className="text-gray-400 hover:text-red-500"><IconTrash size={15} /></button>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
            <p className="text-base font-medium text-gray-800 mb-4">{editingId ? 'แก้ไขรายการจอง' : 'จองคิวใหม่'}</p>
            <div className="space-y-3">
              <div className="relative">
                <label className="text-xs text-gray-500 mb-1 block">ลูกค้า *</label>
                <input value={form.customer_name_display || customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); setForm({...form, customer_id:'', customer_name_display:''}) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="พิมพ์ค้นหาลูกค้า..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => { setForm({...form, customer_id: c.id, customer_name_display: c.customer_name}); setCustomerSearch(''); setShowCustomerDropdown(false) }}
                        className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                        <span className="font-medium">{c.customer_name}</span>
                        {c.line_name && <span className="text-gray-400 ml-2 text-xs">{c.line_name}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">วันที่ตรวจ *</label>
                  <input type="date" value={form.booking_date} onChange={(e) => setForm({...form, booking_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">กะ</label>
                  <select value={form.shift} onChange={(e) => setForm({...form, shift: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option>เช้า</option><option>บ่าย</option><option>เย็น</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ประเภทบริการ</label>
                <select value={form.service_type} onChange={(e) => setForm({...form, service_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option>ตรวจนอกสถานที่ (Mobile)</option>
                  <option>คลินิก</option><option>Walk-in</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จังหวัด</label>
                  <select value={form.province} onChange={(e) => setForm({...form, province: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option value="">เลือกจังหวัด</option>
                    {provinces.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">สัญชาติ</label>
                  <select value={form.nationality} onChange={(e) => setForm({...form, nationality: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option>พม่า</option><option>กัมพูชา</option>
                    <option>ลาว</option><option>เวียดนาม</option><option>อื่นๆ</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ชื่อสถานที่</label>
                <select value={form.location_name} onChange={(e) => setForm({...form, location_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="">เลือกสถานที่</option>
                  {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ลิ้งค์ Google Map</label>
                <input value={form.location_url} onChange={(e) => setForm({...form, location_url: e.target.value})}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">เวลา</label>
                  <input value={form.exam_time} onChange={(e) => setForm({...form, exam_time: e.target.value})}
                    placeholder="เช่น 8.00น.-12.00น."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จำนวนจอง (คน)</label>
                  <input type="text" inputMode="numeric" value={form.booked_count || ''}
                    onChange={(e) => setForm({...form, booked_count: Number(e.target.value.replace(/\D/g,''))})}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ซิมทรู</label>
                <select value={form.sim_true_status} onChange={(e) => setForm({...form, sim_true_status: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option>แจ้งหรือแล้ว</option><option>คำกล่าวประสาน</option>
                  <option>รอคำตอบลูกค้า</option><option>อนุญาต</option>
                  <option>ไม่อนุญาต</option><option>walk-in คลินิก</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <textarea value={form.admin_note} onChange={(e) => setForm({...form, admin_note: e.target.value})} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-lg">
            <p className="text-base font-medium text-gray-800 mb-2">ยืนยันการลบ</p>
            <p className="text-sm text-gray-500 mb-5">ต้องการลบรายการจองนี้ใช่ไหม? ไม่สามารถกู้คืนได้</p>
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