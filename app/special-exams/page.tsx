'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch, IconEdit, IconTrash, IconDownload, IconSettings, IconX } from '@tabler/icons-react'

export default function SpecialExams() {
  const { user, role, ready, logout } = useAuth('/special-exams')
  const [exams, setExams] = useState<any[]>([])
  const [examTypes, setExamTypes] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [customerBookings, setCustomerBookings] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteExamTypeId, setDeleteExamTypeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bookingSearch, setBookingSearch] = useState('')
  const [newExamName, setNewExamName] = useState('')
  const [newExamPrice, setNewExamPrice] = useState('')

  const [form, setForm] = useState({
    customer_id: '', customer_name_display: '',
    booking_id: '',
    location_id: '', location_name: '',
    exam_date: new Date().toISOString().slice(0,10),
    total_workers: 0, note: '',
    items: [] as any[]
  })

  if (ready && !loaded) { fetchAll(); setLoaded(true) }

  async function fetchAll() {
    fetchExams(); fetchExamTypes(); fetchCustomers(); fetchLocations()
  }

  async function fetchExams() {
    const { data } = await supabase
      .from('special_exams')
      .select('*, customers(customer_name), bookings(case_number, booking_date, location_name), special_exam_items(*)')
      .order('exam_date', { ascending: false })
    if (data) setExams(data)
  }

  async function fetchExamTypes() {
    const { data } = await supabase.from('exam_types').select('*').eq('is_active', true).order('sort_order')
    if (data) setExamTypes(data)
  }

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('customer_name')
    if (data) setCustomers(data)
  }

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').eq('is_active', true).order('name')
    if (data) setLocations(data)
  }

  // ดึง booking ทั้งหมดของลูกค้า (ไม่จำกัด 20 รายการ) เพื่อให้ค้นหาเจอแม้เป็น booking เก่า
  async function fetchCustomerBookings(customerId: string) {
    let all: any[] = []
    let from = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('id, case_number, booking_date, location_name, shift')
        .eq('customer_id', customerId)
        .order('booking_date', { ascending: false })
        .range(from, from + 999)
      if (!chunk || chunk.length === 0) break
      all = [...all, ...chunk]
      if (chunk.length < 1000) break
      from += 1000
    }
    setCustomerBookings(all)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({
      customer_id: '', customer_name_display: '',
      booking_id: '', location_id: '', location_name: '',
      exam_date: new Date().toISOString().slice(0,10),
      total_workers: 0, note: '',
      items: examTypes.map(t => ({ exam_type_id: t.id, exam_name: t.name, price_per_unit: t.price, quantity: 0, subtotal: 0 }))
    })
    setCustomerSearch('')
    setCustomerBookings([])
    setBookingSearch('')
    setShowModal(true)
  }

  const openEdit = (exam: any) => {
    setEditingId(exam.id)
    const items = examTypes.map(t => {
      const existing = exam.special_exam_items?.find((i: any) => i.exam_type_id === t.id)
      return {
        exam_type_id: t.id,
        exam_name: t.name,
        price_per_unit: existing?.price_per_unit ?? t.price,
        quantity: existing?.quantity || 0,
        subtotal: existing?.subtotal || 0,
      }
    })
    setForm({
      customer_id: exam.customer_id,
      customer_name_display: exam.customers?.customer_name || '',
      booking_id: exam.booking_id || '',
      location_id: '',
      location_name: exam.location_name || exam.bookings?.location_name || '',
      exam_date: exam.exam_date,
      total_workers: exam.total_workers || 0,
      note: exam.note || '',
      items,
    })
    if (exam.customer_id) fetchCustomerBookings(exam.customer_id)
    setCustomerSearch('')
    setBookingSearch('')
    setShowModal(true)
  }

  const handleSelectCustomer = (c: any) => {
    setForm({...form, customer_id: c.id, customer_name_display: c.customer_name, booking_id: ''})
    setCustomerSearch('')
    setShowCustomerDropdown(false)
    setBookingSearch('')
    fetchCustomerBookings(c.id)
  }

  const handleSelectBooking = (b: any) => {
    setForm({...form, booking_id: b.id, location_name: b.location_name || form.location_name, exam_date: b.booking_date})
  }

  const updateItem = (idx: number, qty: number) => {
    const updated = [...form.items]
    updated[idx].quantity = qty
    updated[idx].subtotal = qty * updated[idx].price_per_unit
    setForm({ ...form, items: updated })
  }

  const updateItemPrice = (idx: number, price: number) => {
    const updated = [...form.items]
    updated[idx].price_per_unit = price
    updated[idx].subtotal = updated[idx].quantity * price
    setForm({ ...form, items: updated })
  }

  // เพิ่มรายการตรวจใหม่ระหว่างกรอกฟอร์ม — บันทึกเข้า exam_types ถาวร แล้วเพิ่มเข้า items ของฟอร์มทันที
  const handleAddNewExamType = async () => {
    if (!newExamName.trim()) return alert('กรุณากรอกชื่อรายการตรวจ')
    const price = Number(newExamPrice.replace(/\D/g, '')) || 0
    const { data, error } = await supabase
      .from('exam_types')
      .insert([{ name: newExamName.trim(), price, is_active: true, sort_order: examTypes.length + 1 }])
      .select()
      .single()
    if (!error && data) {
      setExamTypes([...examTypes, data])
      setForm({
        ...form,
        items: [...form.items, { exam_type_id: data.id, exam_name: data.name, price_per_unit: data.price, quantity: 0, subtotal: 0 }]
      })
      setNewExamName('')
      setNewExamPrice('')
    }
  }

  const totalAmount = form.items.reduce((s, i) => s + (i.subtotal || 0), 0)

  const handleSave = async () => {
    if (!form.customer_id || !form.exam_date) return alert('กรุณาเลือกลูกค้าและวันที่')
    setSaving(true)

    const payload = {
      customer_id: form.customer_id,
      booking_id: form.booking_id || null,
      location_name: form.location_name,
      exam_date: form.exam_date,
      total_workers: form.total_workers,
      total_amount: totalAmount,
      note: form.note,
    }

    let examId = editingId
    if (editingId) {
      await supabase.from('special_exams').update(payload).eq('id', editingId)
      await supabase.from('special_exam_items').delete().eq('special_exam_id', editingId)
    } else {
      const { data } = await supabase.from('special_exams').insert([payload]).select()
      examId = data?.[0]?.id
    }

    const itemsToInsert = form.items
      .filter(i => i.quantity > 0)
      .map(i => ({
        special_exam_id: examId,
        exam_type_id: i.exam_type_id,
        exam_name: i.exam_name,
        price_per_unit: i.price_per_unit,
        quantity: i.quantity,
        subtotal: i.subtotal,
      }))

    if (itemsToInsert.length > 0) {
      await supabase.from('special_exam_items').insert(itemsToInsert)
    }

    setSaving(false); fetchExams(); setShowModal(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('special_exams').delete().eq('id', deleteId)
    setDeleteId(null); fetchExams()
  }

  const handleUpdateExamTypePrice = async (id: string, price: number) => {
    await supabase.from('exam_types').update({ price }).eq('id', id)
    fetchExamTypes()
  }

  // ลบรายการตรวจ (soft delete ด้วย is_active=false เพื่อไม่กระทบประวัติเก่าที่เคยบันทึกไปแล้ว)
  const handleDeleteExamType = async () => {
    if (!deleteExamTypeId) return
    await supabase.from('exam_types').update({ is_active: false }).eq('id', deleteExamTypeId)
    setDeleteExamTypeId(null)
    fetchExamTypes()
  }

  const filtered = exams.filter(e => {
    if (search && !e.customers?.customer_name?.includes(search)) return false
    if (filterDateFrom && e.exam_date < filterDateFrom) return false
    if (filterDateTo && e.exam_date > filterDateTo) return false
    return true
  })

  const filteredBookings = customerBookings.filter(b =>
    !bookingSearch || b.case_number?.toLowerCase().includes(bookingSearch.toLowerCase())
  )

  const exportExcel = () => {
    const rows: any[] = []
    filtered.forEach(e => {
      const items = e.special_exam_items?.filter((i:any) => i.quantity > 0) || []
      if (items.length === 0) {
        rows.push({ 'วันที่': e.exam_date, 'ลูกค้า': e.customers?.customer_name, 'สถานที่': e.location_name || '', 'เลขจอง': e.bookings?.case_number || '', 'จำนวนแรงงาน': e.total_workers, 'รายการ': '', 'จำนวน': '', 'ราคา/คน': '', 'ยอด': '', 'รวม': e.total_amount })
      } else {
        items.forEach((item: any, idx: number) => {
          rows.push({
            'วันที่': idx === 0 ? e.exam_date : '',
            'ลูกค้า': idx === 0 ? e.customers?.customer_name : '',
            'สถานที่': idx === 0 ? (e.location_name || '') : '',
            'เลขจอง': idx === 0 ? (e.bookings?.case_number || '') : '',
            'จำนวนแรงงาน': idx === 0 ? e.total_workers : '',
            'รายการ': item.exam_name,
            'จำนวน': item.quantity,
            'ราคา/คน': item.price_per_unit,
            'ยอด': item.subtotal,
            'รวม': idx === 0 ? e.total_amount : '',
          })
        })
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Special Exams')
    XLSX.writeFile(wb, `special_exams_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const filteredCustomers = customers.filter(c =>
    c.customer_name?.includes(customerSearch) || c.line_name?.includes(customerSearch)
  )

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/special-exams" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">

        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-semibold text-gray-800">ตรวจพิเศษ</p>
            <p className="text-xs text-gray-400 mt-0.5">บันทึกการตรวจพิเศษ</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSettingsModal(true)} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
              <IconSettings size={15}/> ตั้งค่าราคา
            </button>
            <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
              <IconDownload size={15}/> Export
            </button>
            <button onClick={openCreate} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2 transition-colors">
              <IconPlus size={16}/> บันทึกการตรวจ
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400"/>
              <input type="text" placeholder="ค้นหาลูกค้า..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            <button onClick={() => { setSearch(''); setFilterDateFrom(''); setFilterDateTo('') }}
              className="text-xs text-[#185FA5] hover:underline px-2">ล้าง</button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-8 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span>วันที่</span><span className="col-span-2">ลูกค้า</span>
            <span>เลขจอง</span><span>สถานที่</span><span>แรงงาน</span>
            <span>รายการตรวจ</span><span>ยอดรวม</span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-300 text-4xl mb-2">🔬</p>
              <p className="text-sm text-gray-400">ยังไม่มีรายการตรวจพิเศษ</p>
            </div>
          ) : filtered.map(e => {
            const items = e.special_exam_items?.filter((i: any) => i.quantity > 0) || []
            return (
              <div key={e.id} className="grid grid-cols-8 gap-2 px-5 py-3.5 border-b border-gray-50 hover:bg-blue-50/30 transition-colors items-center">
                <span className="text-xs text-gray-500">{e.exam_date}</span>
                <span className="col-span-2 font-medium text-gray-800 text-xs">{e.customers?.customer_name}</span>
                <span className="text-xs text-gray-400 font-mono">{e.bookings?.case_number || '-'}</span>
                <span className="text-xs text-gray-500 truncate">{e.location_name || '-'}</span>
                <span className="text-xs text-gray-600">{e.total_workers > 0 ? `${e.total_workers} คน` : '-'}</span>
                <div className="flex flex-wrap gap-1">
                  {items.slice(0,2).map((item: any) => (
                    <span key={item.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md">
                      {item.exam_name} ×{item.quantity}
                    </span>
                  ))}
                  {items.length > 2 && <span className="text-xs text-gray-400">+{items.length-2}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">฿{e.total_amount?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(e)} className="text-gray-300 hover:text-blue-500 transition-colors"><IconEdit size={14}/></button>
                    <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-red-500 transition-colors"><IconTrash size={14}/></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal บันทึก */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <p className="text-base font-semibold text-gray-800">{editingId ? 'แก้ไขการตรวจพิเศษ' : 'บันทึกการตรวจพิเศษ'}</p>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><IconX size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* ลูกค้า */}
              <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ลูกค้า *</label>
                <input value={form.customer_name_display || customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); setForm({...form, customer_id:'', customer_name_display:'', booking_id:''}) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="พิมพ์ค้นหาลูกค้า..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-40 overflow-y-auto mt-1">
                    {filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => handleSelectCustomer(c)}
                        className="px-3 py-2.5 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-800">{c.customer_name}</span>
                        {c.line_name && <span className="text-gray-400 ml-2 text-xs">{c.line_name}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* เลือก Booking ที่ผูก — เพิ่มช่องค้นหาเลขจอง */}
              {form.customer_id && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">ผูกกับการจอง (ถ้ามี)</label>
                  {customerBookings.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">ไม่พบรายการจองของลูกค้านี้</p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <IconSearch size={13} className="absolute left-2.5 top-2 text-gray-400"/>
                        <input value={bookingSearch} onChange={(e) => setBookingSearch(e.target.value)}
                          placeholder="ค้นหาเลขจอง..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                      </div>
                      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setForm({...form, booking_id: ''})}>
                          <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${!form.booking_id ? 'border-[#185FA5] bg-[#185FA5]' : 'border-gray-300'}`}/>
                          <span className="text-xs text-gray-500">ไม่ผูกกับการจอง</span>
                        </div>
                        {filteredBookings.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">ไม่พบเลขจองที่ค้นหา</p>
                        ) : filteredBookings.map(b => (
                          <div key={b.id} onClick={() => handleSelectBooking(b)}
                            className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 cursor-pointer hover:bg-blue-50 ${form.booking_id === b.id ? 'bg-blue-50' : ''}`}>
                            <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${form.booking_id === b.id ? 'border-[#185FA5] bg-[#185FA5]' : 'border-gray-300'}`}/>
                            <div>
                              <span className="text-xs font-medium text-gray-700 font-mono">{b.case_number}</span>
                              <span className="text-xs text-gray-400 ml-2">{b.booking_date} · {b.location_name || '-'} · {b.shift}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">วันที่ตรวจ *</label>
                  <input type="date" value={form.exam_date} onChange={(e) => setForm({...form, exam_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">สาขา / คลินิก</label>
                  <select value={form.location_name} onChange={(e) => setForm({...form, location_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option value="">เลือกสาขา</option>
                    {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">จำนวนแรงงานรวม</label>
                <input type="text" inputMode="numeric" value={form.total_workers || ''}
                  onChange={(e) => setForm({...form, total_workers: Number(e.target.value.replace(/\D/g,''))})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>

              {/* รายการตรวจ */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-3">รายการตรวจพิเศษ</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-5 gap-2 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-500">
                    <span className="col-span-2">รายการ</span>
                    <span>ราคา/คน</span>
                    <span>จำนวน</span>
                    <span>ยอด</span>
                  </div>
                  {form.items.map((item, idx) => (
                    <div key={idx} className={`grid grid-cols-5 gap-2 px-4 py-2 border-b border-gray-50 items-center ${item.quantity > 0 ? 'bg-blue-50/30' : ''}`}>
                      <span className="col-span-2 text-xs text-gray-700 font-medium">{item.exam_name}</span>
                      <input type="text" inputMode="numeric" value={item.price_per_unit}
                        onChange={(e) => updateItemPrice(idx, Number(e.target.value.replace(/\D/g,'')))}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#185FA5] w-full"/>
                      <input type="text" inputMode="numeric" value={item.quantity || ''}
                        onChange={(e) => updateItem(idx, Number(e.target.value.replace(/\D/g,'')))}
                        placeholder="0"
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#185FA5] w-full"/>
                      <span className={`text-xs font-bold text-right ${item.subtotal > 0 ? 'text-[#185FA5]' : 'text-gray-300'}`}>
                        {item.subtotal > 0 ? `฿${item.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                      </span>
                    </div>
                  ))}
                  {/* เพิ่มรายการตรวจใหม่ */}
                  <div className="grid grid-cols-5 gap-2 px-4 py-2.5 border-b border-gray-50 bg-emerald-50/40 items-center">
                    <input value={newExamName} onChange={(e) => setNewExamName(e.target.value)}
                      placeholder="+ ชื่อรายการตรวจใหม่..."
                      className="col-span-2 border border-emerald-200 bg-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"/>
                    <input value={newExamPrice} onChange={(e) => setNewExamPrice(e.target.value.replace(/\D/g,''))}
                      placeholder="ราคา"
                      className="border border-emerald-200 bg-white rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-400"/>
                    <button type="button" onClick={handleAddNewExamType}
                      className="col-span-2 text-xs bg-emerald-500 text-white rounded-lg py-1.5 hover:bg-emerald-600 font-medium">
                      + เพิ่มรายการ
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-gray-800">
                    <span className="col-span-4 text-xs font-bold text-white">รวมทั้งหมด</span>
                    <span className="text-sm font-bold text-emerald-400 text-right">฿{totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">หมายเหตุ</label>
                <textarea value={form.note} onChange={(e) => setForm({...form, note: e.target.value})} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50 font-medium transition-colors">
                {saving ? 'กำลังบันทึก...' : `บันทึก (฿${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ตั้งค่าราคา — เพิ่มปุ่มลบรายการ */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <p className="text-base font-semibold text-gray-800">ตั้งค่าราคาตรวจพิเศษ</p>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600"><IconX size={20}/></button>
            </div>
            <div className="p-6 space-y-2 max-h-96 overflow-y-auto">
              {examTypes.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-700 flex-1">{t.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">฿</span>
                    <input type="text" inputMode="numeric" defaultValue={t.price}
                      onBlur={(e) => handleUpdateExamTypePrice(t.id, Number(e.target.value.replace(/\D/g,'')))}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                  </div>
                  <button onClick={() => setDeleteExamTypeId(t.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                    <IconTrash size={15}/>
                  </button>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => { setShowSettingsModal(false); fetchExamTypes() }}
                className="px-5 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] font-medium">เสร็จสิ้น</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <p className="text-base font-semibold text-gray-800 mb-2">ยืนยันการลบ</p>
            <p className="text-sm text-gray-500 mb-5">ต้องการลบรายการตรวจพิเศษนี้ใช่ไหม?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">ลบ</button>
            </div>
          </div>
        </div>
      )}

      {deleteExamTypeId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <p className="text-base font-semibold text-gray-800 mb-2">ยืนยันการลบรายการตรวจ</p>
            <p className="text-sm text-gray-500 mb-5">รายการนี้จะถูกซ่อนจากตัวเลือกใหม่ แต่ประวัติเดิมที่บันทึกไปแล้วจะไม่หาย ต้องการลบใช่ไหม?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteExamTypeId(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleDeleteExamType} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}