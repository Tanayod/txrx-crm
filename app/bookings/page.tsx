'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch } from '@tabler/icons-react'

const provinces = ['กรุงเทพมหานคร','สมุทรสาคร','ชลบุรี','นนทบุรี','ปทุมธานี','ระยอง','ลพบุรี','เชียงใหม่','นครปฐม','สมุทรปราการ','พระนครศรีอยุธยา','ลำพูน','เพชรบูรณ์','อื่นๆ']

export default function Bookings() {
  const { user, role, ready, logout } = useAuth('/bookings')
  const [bookings, setBookings] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState({
    customer_id: '', customer_name_display: '',
    booking_date: '', shift: 'เช้า',
    service_type: 'ตรวจนอกสถานที่ (Mobile)',
    province: '', location_name: '', location_url: '',
    exam_time: '', nationality: 'พม่า',
    booked_count: 0, sim_true_status: 'รอคำตอบลูกค้า',
    admin_note: ''
  })

  if (ready && !loaded) {
    fetchBookings()
    fetchCustomers()
    setLoaded(true)
  }

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(customer_name)')
      .order('created_at', { ascending: false })
    if (data) setBookings(data)
  }

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('customer_name')
    if (data) setCustomers(data)
  }

  const generateCaseNumber = () => {
    const d = new Date().toISOString().slice(0,10).replace(/-/g,'')
    const rand = Math.floor(Math.random()*900)+100
    return `TXR-${d}-${rand}`
  }

  const handleSave = async () => {
    if (!form.customer_id || !form.booking_date) return alert('กรุณาเลือกลูกค้าและวันที่')
    const { error } = await supabase.from('bookings').insert([{
      case_number: generateCaseNumber(),
      customer_id: form.customer_id,
      booking_date: form.booking_date,
      shift: form.shift,
      service_type: form.service_type,
      province: form.province,
      location_name: form.location_name,
      location_url: form.location_url,
      exam_time: form.exam_time,
      nationality: form.nationality,
      booked_count: form.booked_count,
      sim_true_status: form.sim_true_status,
      admin_note: form.admin_note,
    }])
    if (!error) {
      fetchBookings()
      setShowModal(false)
      setForm({ customer_id:'', customer_name_display:'', booking_date:'', shift:'เช้า', service_type:'ตรวจนอกสถานที่ (Mobile)', province:'', location_name:'', location_url:'', exam_time:'', nationality:'พม่า', booked_count:0, sim_true_status:'รอคำตอบลูกค้า', admin_note:'' })
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.customer_name?.includes(customerSearch) || c.line_name?.includes(customerSearch)
  )

  const filtered = bookings.filter(b =>
    b.customers?.customer_name?.includes(search) ||
    b.case_number?.includes(search) ||
    b.location_name?.includes(search)
  )

  const statusColor: any = {
    'อนุญาต': 'bg-green-50 text-green-600',
    'ไม่อนุญาต': 'bg-red-50 text-red-600',
    'รอคำตอบลูกค้า': 'bg-amber-50 text-amber-600',
    'แจ้งหรือแล้ว': 'bg-blue-50 text-blue-600',
    'คำกล่าวประสาน': 'bg-purple-50 text-purple-600',
    'walk-in คลินิก': 'bg-gray-100 text-gray-500',
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
          <button onClick={() => setShowModal(true)} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2">
            <IconPlus size={16} /> จองคิวใหม่
          </button>
        </div>

        <div className="relative mb-4">
          <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="ค้นหาลูกค้า เลขจอง หรือสถานที่..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] bg-white" />
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่</span>
            <span>สถานที่</span><span>จำนวนจอง</span><span>ซิมทรู</span><span>สถานะ</span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีรายการจอง</div>
          ) : (
            filtered.map((b) => (
              <div key={b.id} className="grid grid-cols-7 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                <span className="font-medium text-gray-700">{b.customers?.customer_name}</span>
                <span className="text-gray-500">{b.booking_date}</span>
                <span className="text-gray-500 text-xs">{b.location_name || '-'}</span>
                <span className="text-gray-700">{b.booked_count?.toLocaleString()} คน</span>
                <span><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[b.sim_true_status] || 'bg-gray-100 text-gray-500'}`}>{b.sim_true_status}</span></span>
                <span><span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{b.shift}</span></span>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
            <p className="text-base font-medium text-gray-800 mb-4">จองคิวใหม่</p>
            <div className="space-y-3">

              <div className="relative">
                <label className="text-xs text-gray-500 mb-1 block">ลูกค้า *</label>
                <input
                  value={form.customer_name_display || customerSearch}
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
                  <option>คลินิก</option>
                  <option>Walk-in</option>
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
                <input value={form.location_name} onChange={(e) => setForm({...form, location_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
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
                  <option>แจ้งหรือแล้ว</option>
                  <option>คำกล่าวประสาน</option>
                  <option>รอคำตอบลูกค้า</option>
                  <option>อนุญาต</option>
                  <option>ไม่อนุญาต</option>
                  <option>walk-in คลินิก</option>
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
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C]">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}