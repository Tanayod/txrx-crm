'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch, IconEdit, IconTrash, IconDownload, IconX } from '@tabler/icons-react'

const DUE_TYPE_LABELS: any = {
  standard_3: 'มาตรฐาน (ครบกำหนด 3 วัน)',
  vip_30: 'VIP (ครบกำหนด 30 วัน)',
  fifth_next_month: 'ครบกำหนดวันที่ 5 เดือนถัดไป',
}

export default function Customers() {
  const { user, role, ready, logout } = useAuth('/customers')
  const [customers, setCustomers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState({ line_name: '', customer_name: '', phone: '', type: 'general', credit_limit: 0, opening_balance: 0, due_type: 'standard_3', note: '' })

  const [showDebtModal, setShowDebtModal] = useState(false)
  const [debtCustomer, setDebtCustomer] = useState<any>(null)
  const [debtBookings, setDebtBookings] = useState<any[]>([])
  const [debtLoading, setDebtLoading] = useState(false)

  if (ready && !loaded) { fetchCustomers(); setLoaded(true) }

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (data) setCustomers(data)
  }

  // ยอดค้างจาก booking ที่ยังไม่ชำระ/ค้างชำระ/เครดิต (ยังไม่ตัด)
  const getUnpaidTotal = async (customerId: string) => {
    const { data } = await supabase
      .from('bookings')
      .select('id, case_number, booking_date, payments(amount_received, total_amount, payment_status)')
      .eq('customer_id', customerId)
    const rows = (data || []).map((b: any) => {
      const p = Array.isArray(b.payments) ? b.payments?.[0] : b.payments
      const total = p?.total_amount || 0
      const received = p?.amount_received || 0
      const status = p?.payment_status
      const outstanding = (status === 'ยังไม่ชำระ' || status === 'ค้างชำระ' || status === 'เครดิต')
        ? Math.max(total - received, 0)
        : 0
      return { case_number: b.case_number, booking_date: b.booking_date, total, received, outstanding, status: status || 'ยังไม่ชำระ' }
    }).filter((r: any) => r.outstanding > 0)
    return rows
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ line_name: '', customer_name: '', phone: '', type: 'general', credit_limit: 0, opening_balance: 0, due_type: 'standard_3', note: '' })
    setShowModal(true)
  }

  const openEdit = (c: any) => {
    setEditingId(c.id)
    setForm({ line_name: c.line_name || '', customer_name: c.customer_name, phone: c.phone || '', type: c.type, credit_limit: c.credit_limit || 0, opening_balance: c.opening_balance || 0, due_type: c.due_type || 'standard_3', note: c.note || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.customer_name) return alert('กรุณากรอกชื่อลูกค้า')
    if (editingId) {
      await supabase.from('customers').update(form).eq('id', editingId)
    } else {
      await supabase.from('customers').insert([form])
    }
    fetchCustomers(); setShowModal(false)
  }

  // ถ้ามี booking ผูกอยู่ ห้ามลบจริง ให้ซ่อน (is_active=false) แทน เพื่อรักษาประวัติเก่าไว้
  const handleDelete = async () => {
    if (!deleteId) return
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', deleteId)
    if (count && count > 0) {
      await supabase.from('customers').update({ is_active: false }).eq('id', deleteId)
      alert(`ลูกค้านี้มี ${count} รายการจองผูกอยู่ ระบบได้ซ่อนลูกค้านี้ไว้แทนการลบ เพื่อรักษาประวัติเก่า`)
    } else {
      await supabase.from('customers').delete().eq('id', deleteId)
    }
    setDeleteId(null); fetchCustomers()
  }

  const handleRestore = async (id: string) => {
    await supabase.from('customers').update({ is_active: true }).eq('id', id)
    fetchCustomers()
  }

  const openDebtModal = async (c: any) => {
    setDebtCustomer(c)
    setShowDebtModal(true)
    setDebtLoading(true)
    const rows = await getUnpaidTotal(c.id)
    setDebtBookings(rows)
    setDebtLoading(false)
  }

  const debtBookingTotal = debtBookings.reduce((s, r) => s + r.outstanding, 0)
  const debtGrandTotal = (debtCustomer?.opening_balance || 0) + debtBookingTotal

  const filtered = customers.filter(c => {
    if (!showInactive && c.is_active === false) return false
    if (search && !c.customer_name?.includes(search) && !c.line_name?.includes(search) && !c.phone?.includes(search)) return false
    if (filterType && c.type !== filterType) return false
    return true
  })

  const exportExcel = () => {
    const rows = filtered.map(c => ({
      'รหัส': `CUS-${String(c.customer_code).padStart(3,'0')}`,
      'ชื่อลูกค้า': c.customer_name,
      'ชื่อ LINE': c.line_name || '',
      'เบอร์โทร': c.phone || '',
      'ประเภท': c.type === 'credit' ? 'เครดิต' : 'ทั่วไป',
      'วงเงินเครดิต': c.credit_limit || 0,
      'ยอดยกมา': c.opening_balance || 0,
      'หมายเหตุ': c.note || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, `customers_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/customers" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">ลูกค้า</p>
            <p className="text-xs text-gray-400 mt-0.5">รายชื่อลูกค้าทั้งหมด</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <IconDownload size={15} /> Export Excel
            </button>
            <button onClick={openCreate} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2">
              <IconPlus size={16} /> เพิ่มลูกค้า
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
          <div className="relative">
            <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input type="text" placeholder="ค้นหาชื่อลูกค้า LINE หรือเบอร์โทร..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
          </div>
          <div className="flex gap-3 items-end">
            <div className="w-48">
              <label className="text-xs text-gray-400 mb-1 block">ประเภทลูกค้า</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="general">ทั่วไป</option>
                <option value="vip">VIP</option>
                <option value="credit">เครดิต</option>
              </select>
            </div>
            <div className="flex justify-between items-center flex-1">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-gray-300"/>
                แสดงลูกค้าที่ซ่อนไว้
              </label>
              <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
              <button onClick={() => { setSearch(''); setFilterType('') }} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-8 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>รหัส</span><span>ชื่อลูกค้า</span><span>ชื่อ LINE</span>
            <span>เบอร์โทร</span><span>ประเภท</span><span>ยอดยกมา</span><span>หมายเหตุ</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบข้อมูลลูกค้า</div>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className={`grid grid-cols-8 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center ${c.is_active === false ? 'opacity-50' : ''}`}>
                <span className="text-gray-400 text-xs">CUS-{String(c.customer_code).padStart(3,'0')}</span>
                <span className="font-medium text-gray-700 flex items-center gap-1.5">
                  {c.customer_name}
                  {c.is_active === false && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">ซ่อนอยู่</span>}
                </span>
                <span className="text-gray-500">{c.line_name || '-'}</span>
                <span className="text-gray-500">{c.phone || '-'}</span>
                <span><span className={`text-xs px-2 py-0.5 rounded-full ${c.type === 'credit' ? 'bg-amber-50 text-amber-600' : c.type === 'vip' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                  {c.type === 'credit' ? 'เครดิต' : c.type === 'vip' ? 'VIP' : 'ทั่วไป'}
                </span></span>
                <span>
                  {c.opening_balance > 0 ? (
                    <button onClick={() => openDebtModal(c)} className="text-xs text-red-500 font-semibold hover:underline">
                      ฿{c.opening_balance.toLocaleString()}+
                    </button>
                  ) : (
                    <button onClick={() => openDebtModal(c)} className="text-xs text-gray-400 hover:text-[#185FA5] hover:underline">
                      ดูยอดค้าง
                    </button>
                  )}
                </span>
                <span className="text-gray-400 text-xs">{c.note || '-'}</span>
                <span className="flex gap-2 justify-end">
                  {c.is_active === false ? (
                    <button onClick={() => handleRestore(c.id)} className="text-xs text-emerald-600 hover:underline font-medium">เปิดใช้งานคืน</button>
                  ) : (
                    <>
                      <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-blue-500"><IconEdit size={15} /></button>
                      <button onClick={() => setDeleteId(c.id)} className="text-gray-400 hover:text-red-500"><IconTrash size={15} /></button>
                    </>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
            <p className="text-base font-medium text-gray-800 mb-4">{editingId ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ชื่อลูกค้า *</label>
                <input value={form.customer_name} onChange={(e) => setForm({...form, customer_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ชื่อ LINE</label>
                <input value={form.line_name} onChange={(e) => setForm({...form, line_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">เบอร์โทร</label>
                <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ประเภท</label>
                <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="general">ทั่วไป</option>
                  <option value="vip">VIP</option>
                  <option value="credit">เครดิต</option>
                </select>
              </div>
              {form.type === 'credit' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">วงเงินเครดิต (ไม่บังคับ)</label>
                  <input type="number" value={form.credit_limit} onChange={(e) => setForm({...form, credit_limit: Number(e.target.value)})}
                    placeholder="ปล่อยว่างได้ถ้าไม่กำหนดวงเงิน"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
              )}
              {(form.type === 'credit' || form.type === 'vip') && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <label className="text-xs text-blue-700 font-medium mb-1 block">เงื่อนไขครบกำหนดชำระ</label>
                  <select value={form.due_type} onChange={(e) => setForm({...form, due_type: e.target.value})}
                    className="w-full border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="standard_3">มาตรฐาน (3 วัน)</option>
                    <option value="vip_30">VIP (30 วัน)</option>
                    <option value="fifth_next_month">วันที่ 5 ของเดือนถัดไป</option>
                  </select>
                </div>
              )}
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <label className="text-xs text-red-600 font-medium mb-1 block">ยอดค้างยกมา (ก่อนใช้ระบบ)</label>
                <input type="number" value={form.opening_balance} onChange={(e) => setForm({...form, opening_balance: Number(e.target.value)})}
                  placeholder="0"
                  className="w-full border border-red-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <p className="text-xs text-red-400 mt-1">ใส่ยอดหนี้เดิมที่ลูกค้าค้างอยู่ก่อนเริ่มใช้ระบบนี้ (ถ้ามี)</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <input value={form.note} onChange={(e) => setForm({...form, note: e.target.value})}
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

      {showDebtModal && debtCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <p className="text-base font-semibold text-gray-800">{debtCustomer.customer_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">รายละเอียดยอดค้างชำระ</p>
              </div>
              <button onClick={() => setShowDebtModal(false)} className="text-gray-400 hover:text-gray-600"><IconX size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {debtCustomer.opening_balance > 0 && (
                <div className="flex justify-between items-center bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 mb-2">
                  <span className="text-xs text-amber-700 font-medium">ยอดยกมา (ก่อนใช้ระบบ)</span>
                  <span className="text-sm font-bold text-amber-600">฿{debtCustomer.opening_balance.toLocaleString()}</span>
                </div>
              )}
              {debtLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">กำลังโหลด...</p>
              ) : debtBookings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">ไม่มียอดค้างจาก booking</p>
              ) : (
                <div className="space-y-1.5">
                  {debtBookings.map((b, i) => (
                    <div key={i} className="flex justify-between items-center bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-gray-700">{b.case_number}</p>
                        <p className="text-xs text-gray-400">{b.booking_date} · {b.status}</p>
                      </div>
                      <span className="text-sm font-bold text-red-500">฿{b.outstanding.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">ยอดค้างรวมทั้งหมด</span>
                <span className="text-xl font-bold text-red-500">฿{debtGrandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-lg">
            <p className="text-base font-medium text-gray-800 mb-2">ยืนยันการลบ</p>
            <p className="text-sm text-gray-500 mb-5">ต้องการลบลูกค้านี้ใช่ไหม? (ถ้ามีรายการจองผูกอยู่ ระบบจะซ่อนแทนการลบถาวร เพื่อรักษาประวัติเก่าไว้)</p>
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