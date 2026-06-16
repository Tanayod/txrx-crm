'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconUpload, IconCheck, IconSearch, IconDownload, IconPlus, IconX, IconMicroscope } from '@tabler/icons-react'

export default function Payments() {
  const { user, role, ready, logout } = useAuth('/payments')
  const [bookings, setBookings] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState({
    amount_received: 0, method: 'transfer',
    payment_status: 'ชำระเงินแล้ว', invoice_no: '',
    worker_count: 0, price_per_worker: 0,
    ref_no: '', note: '',
  })
  const [splitPayments, setSplitPayments] = useState<any[]>([])
  const [splitSource, setSplitSource] = useState({ method: 'transfer' })

  const [search, setSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [filterBookedMin, setFilterBookedMin] = useState('')
  const [filterBookedMax, setFilterBookedMax] = useState('')
  const [filterActualMin, setFilterActualMin] = useState('')
  const [filterActualMax, setFilterActualMax] = useState('')
  const [filterHasActual, setFilterHasActual] = useState('')

  if (ready && !loaded) { fetchBookings(); setLoaded(true) }

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(customer_name, type, credit_limit, credit_balance), payments(*), medical_cases(actual_count), special_exams(total_amount)')
      .order('booking_date', { ascending: false })
    if (data) setBookings(data)
  }

  const getMc = (b: any) => Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases

  const getSpecialTotal = (b: any) => {
    return (b.special_exams || []).reduce((s: number, e: any) => s + (e.total_amount || 0), 0)
  }

  const getGrandTotal = (b: any) => {
    const p = b.payments?.[0]
    const workerTotal = (p?.worker_count || 0) * (p?.price_per_worker || 0)
    const specialTotal = getSpecialTotal(b)
    return workerTotal + specialTotal
  }

  const handleOpenModal = (booking: any) => {
    setSelected(booking)
    const p = booking.payments?.[0]
    const mc = getMc(booking)
    const actualCount = mc?.actual_count || booking.booked_count || 0
    setForm({
      amount_received: p?.amount_received || 0,
      method: p?.method || 'transfer',
      payment_status: p?.payment_status || 'ยังไม่ชำระ',
      invoice_no: p?.invoice_no || '',
      worker_count: p?.worker_count || actualCount,
      price_per_worker: p?.price_per_worker || 0,
      ref_no: p?.ref_no || '',
      note: p?.note || '',
    })
    setShowModal(true)
  }

  const normalTotal = form.worker_count * form.price_per_worker
  const specialAmountSelected = selected ? getSpecialTotal(selected) : 0
  const grandTotalSelected = normalTotal + specialAmountSelected

  const handleSave = async () => {
    const p = selected?.payments?.[0]
    const payload = {
      amount_received: form.amount_received || grandTotalSelected,
      method: form.method,
      payment_status: form.payment_status,
      invoice_no: form.invoice_no,
      worker_count: form.worker_count,
      price_per_worker: form.price_per_worker,
      total_amount: grandTotalSelected,
      ref_no: form.ref_no,
      note: form.note,
      paid_at: form.payment_status === 'ชำระเงินแล้ว' ? new Date().toISOString() : null,
    }
    if (p?.id) {
      await supabase.from('payments').update(payload).eq('id', p.id)
    } else {
      await supabase.from('payments').insert([{ ...payload, booking_id: selected.id, customer_id: selected.customer_id }])
    }
    fetchBookings(); setShowModal(false)
  }

  const handleUploadSlip = async (e: any) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fileName = `${selected.id}_slip_${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('certificates').upload(fileName, file)
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('certificates').getPublicUrl(fileName)
      const p = selected?.payments?.[0]
      if (p?.id) await supabase.from('payments').update({ slip_url: urlData.publicUrl, is_verified: true }).eq('id', p.id)
      fetchBookings()
    }
    setUploading(false)
  }

  const openSplitModal = () => {
    const unpaidBookings = bookings.filter(b => {
      const p = b.payments?.[0]
      return !p || p.payment_status !== 'ชำระเงินแล้ว'
    })
    setSplitPayments(unpaidBookings.map(b => ({
      booking_id: b.id,
      case_number: b.case_number,
      customer_name: b.customers?.customer_name,
      booking_date: b.booking_date,
      grand_total: getGrandTotal(b),
      amount: 0,
      selected: false,
    })))
    setShowSplitModal(true)
  }

  const handleSplitSave = async () => {
    const selectedItems = splitPayments.filter(s => s.selected && s.amount > 0)
    for (const item of selectedItems) {
      const booking = bookings.find(b => b.id === item.booking_id)
      const p = booking?.payments?.[0]
      const payload = {
        booking_id: item.booking_id,
        customer_id: booking?.customer_id,
        amount_received: item.amount,
        method: splitSource.method,
        payment_status: 'ชำระเงินแล้ว',
        paid_at: new Date().toISOString(),
      }
      if (p?.id) {
        await supabase.from('payments').update(payload).eq('id', p.id)
      } else {
        await supabase.from('payments').insert([payload])
      }
    }
    fetchBookings(); setShowSplitModal(false)
  }

  const splitTotal = splitPayments.filter(s => s.selected).reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

  const getPaymentStatus = (booking: any) => {
    const p = booking.payments?.[0]
    if (!p) return { label: 'ยังไม่ชำระ', color: 'bg-gray-100 text-gray-500' }
    const map: any = {
      'ชำระเงินแล้ว': 'bg-green-100 text-green-700',
      'ยังไม่ชำระ': 'bg-gray-100 text-gray-500',
      'ค้างชำระ': 'bg-red-100 text-red-600',
      'เครดิต': 'bg-amber-100 text-amber-600',
    }
    return { label: p.payment_status, color: map[p.payment_status] || 'bg-gray-100 text-gray-500' }
  }

  const filtered = bookings.filter(b => {
    const p = b.payments?.[0]
    const mc = getMc(b)
    const status = getPaymentStatus(b)
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search)) return false
    if (filterDateFrom && b.booking_date < filterDateFrom) return false
    if (filterDateTo && b.booking_date > filterDateTo) return false
    if (filterStatus && status.label !== filterStatus) return false
    if (filterMethod && p?.method !== filterMethod) return false
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
      const p = b.payments?.[0]
      const mc = getMc(b)
      const specialAmt = getSpecialTotal(b)
      const grandTotal = getGrandTotal(b)
      return {
        'เลขจอง': b.case_number,
        'ลูกค้า': b.customers?.customer_name,
        'วันที่': b.booking_date,
        'จำนวนแรงงาน': p?.worker_count || mc?.actual_count || 0,
        'ราคา/คน': p?.price_per_worker || 0,
        'ยอดปกติ': (p?.worker_count || 0) * (p?.price_per_worker || 0),
        'ยอดตรวจพิเศษ': specialAmt,
        'ยอดรวม': grandTotal,
        'ยอดรับ': p?.amount_received || 0,
        'วิธีชำระ': p?.method || '',
        'สถานะ': getPaymentStatus(b).label,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payments')
    XLSX.writeFile(wb, `payments_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const clearFilters = () => {
    setSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterStatus(''); setFilterMethod('')
    setFilterBookedMin(''); setFilterBookedMax('')
    setFilterActualMin(''); setFilterActualMax(''); setFilterHasActual('')
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/payments" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">

        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-semibold text-gray-800">การเงิน</p>
            <p className="text-xs text-gray-400 mt-0.5">สถานะการชำระเงินทั้งหมด</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors">
              <IconDownload size={15}/> Export
            </button>
            <button onClick={openSplitModal} className="border border-[#185FA5] text-[#185FA5] px-4 py-2 rounded-lg text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors">
              <IconPlus size={15}/> ตัดชำระหลายจอง
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="relative mb-3">
            <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400"/>
            <input type="text" placeholder="ค้นหาลูกค้า หรือเลขจอง..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
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
              <label className="text-xs text-gray-400 mb-1 block">สถานะ</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>ชำระเงินแล้ว</option><option>ยังไม่ชำระ</option>
                <option>ค้างชำระ</option><option>เครดิต</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วิธีชำระ</label>
              <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="transfer">โอนเงิน</option>
                <option value="cash">เงินสด</option>
                <option value="credit">เครดิต</option>
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
          <div className="grid grid-cols-9 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่</span>
            <span>แรงงาน</span><span>ราคา/คน</span><span>ยอดปกติ</span>
            <span>ตรวจพิเศษ</span><span>สถานะ</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-300 text-4xl mb-2">💰</p>
              <p className="text-sm text-gray-400">ไม่พบรายการ</p>
            </div>
          ) : filtered.map((b) => {
            const status = getPaymentStatus(b)
            const p = b.payments?.[0]
            const mc = getMc(b)
            const workerCount = p?.worker_count || mc?.actual_count || b.booked_count || 0
            const normalAmt = (p?.worker_count || 0) * (p?.price_per_worker || 0)
            const specialAmt = getSpecialTotal(b)
            const grandTotal = getGrandTotal(b)
            return (
              <div key={b.id} className="grid grid-cols-9 gap-2 px-5 py-3.5 border-b border-gray-50 text-sm hover:bg-blue-50/30 transition-colors items-center">
                <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                <div>
                  <p className="font-medium text-gray-800 text-xs">{b.customers?.customer_name}</p>
                  {b.customers?.type === 'credit' && <p className="text-xs text-amber-500">เครดิต</p>}
                </div>
                <span className="text-gray-500 text-xs">{b.booking_date}</span>
                <span className="text-gray-700 text-xs">{workerCount > 0 ? `${workerCount} คน` : '-'}</span>
                <span className="text-gray-700 text-xs">{p?.price_per_worker > 0 ? `฿${p.price_per_worker}` : '-'}</span>
                <span className="text-gray-700 text-xs">{normalAmt > 0 ? `฿${normalAmt.toLocaleString()}` : '-'}</span>
                <div>
                  {specialAmt > 0 ? (
                    <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md font-medium flex items-center gap-0.5 w-fit">
                      <IconMicroscope size={10}/>฿{specialAmt.toLocaleString()}
                    </span>
                  ) : <span className="text-xs text-gray-300">-</span>}
                  {grandTotal > 0 && <p className="text-xs font-bold text-gray-800 mt-0.5">รวม ฿{grandTotal.toLocaleString()}</p>}
                </div>
                <span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span></span>
                <button onClick={() => handleOpenModal(b)} className="text-xs text-[#185FA5] hover:underline text-right font-medium">บันทึก</button>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-gray-100">
              <p className="text-base font-semibold text-gray-800">{selected.customers?.customer_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{selected.case_number} · {selected.booking_date}</p>
            </div>
            <div className="p-6 space-y-4">
              {selected.customers?.type === 'credit' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs text-amber-700 font-semibold">ลูกค้าเครดิต</p>
                  <p className="text-xs text-amber-600 mt-0.5">วงเงิน: ฿{selected.customers.credit_limit?.toLocaleString()} | ค้างอยู่: ฿{selected.customers.credit_balance?.toLocaleString()}</p>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 mb-3">💰 คำนวณยอดเงิน</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">จำนวนแรงงาน (คน)</label>
                    <input type="text" inputMode="numeric" value={form.worker_count || ''}
                      onChange={(e) => setForm({...form, worker_count: Number(e.target.value.replace(/\D/g,''))})}
                      placeholder="0"
                      className="w-full border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">ราคา/คน (บาท)</label>
                    <input type="text" inputMode="numeric" value={form.price_per_worker || ''}
                      onChange={(e) => setForm({...form, price_per_worker: Number(e.target.value.replace(/\D/g,''))})}
                      placeholder="0"
                      className="w-full border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                </div>
                <div className="space-y-1.5 bg-white rounded-lg p-3 border border-blue-200">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>ยอดตรวจสุขภาพปกติ</span>
                    <span className="font-medium text-gray-700">฿{normalTotal.toLocaleString()}</span>
                  </div>
                  {specialAmountSelected > 0 && (
                    <div className="flex justify-between text-xs text-purple-600">
                      <span className="flex items-center gap-1"><IconMicroscope size={10}/>ยอดตรวจพิเศษ</span>
                      <span className="font-medium">฿{specialAmountSelected.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-100 pt-1.5">
                    <span className="text-sm font-semibold text-gray-700">ยอดรวมทั้งหมด</span>
                    <span className="text-lg font-bold text-[#185FA5]">฿{grandTotalSelected.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">ยอดรับชำระจริง (บาท)</label>
                <input type="text" inputMode="numeric" value={form.amount_received || ''}
                  onChange={(e) => setForm({...form, amount_received: Number(e.target.value.replace(/\D/g,''))})}
                  placeholder={`${grandTotalSelected.toLocaleString()} (ปล่อยว่างถ้าเท่ากับยอดรวม)`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">วิธีชำระ</label>
                  <select value={form.method} onChange={(e) => setForm({...form, method: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option value="transfer">โอนเงิน</option>
                    <option value="cash">เงินสด</option>
                    <option value="credit">เครดิต</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">สถานะ</label>
                  <select value={form.payment_status} onChange={(e) => setForm({...form, payment_status: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option>ชำระเงินแล้ว</option><option>ยังไม่ชำระ</option>
                    <option>ค้างชำระ</option><option>เครดิต</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">เลขที่ใบวางบิล</label>
                <input value={form.invoice_no} onChange={(e) => setForm({...form, invoice_no: e.target.value})}
                  placeholder="INV-XXXX"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">เลขที่อ้างอิง</label>
                <input value={form.ref_no} onChange={(e) => setForm({...form, ref_no: e.target.value})}
                  placeholder="เลขที่อ้างอิงการโอน..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">หมายเหตุ</label>
                <textarea value={form.note} onChange={(e) => setForm({...form, note: e.target.value})} rows={2}
                  placeholder="หมายเหตุเพิ่มเติม..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
              <button onClick={handleSave} className="w-full bg-[#185FA5] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#0C447C] transition-colors">
                บันทึกการชำระเงิน
              </button>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-600 mb-2">แนบสลิป</p>
                {selected.payments?.[0]?.slip_url && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg mb-2">
                    <IconCheck size={13} className="text-green-600"/>
                    <a href={selected.payments[0].slip_url} target="_blank" className="text-xs text-green-700 hover:underline">ดูสลิป</a>
                  </div>
                )}
                <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500 transition-colors">
                  <IconUpload size={15}/>
                  {uploading ? 'กำลังอัพโหลด...' : 'แนบไฟล์สลิป'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadSlip} className="hidden" disabled={uploading}/>
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {showSplitModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <p className="text-base font-semibold text-gray-800">ตัดชำระหลายจอง</p>
                <p className="text-xs text-gray-400 mt-0.5">เลือกรายการที่ต้องการตัดและระบุยอด</p>
              </div>
              <button onClick={() => setShowSplitModal(false)} className="text-gray-400 hover:text-gray-600"><IconX size={20}/></button>
            </div>
            <div className="p-4 border-b border-gray-100 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">วิธีชำระ</label>
                <select value={splitSource.method} onChange={(e) => setSplitSource({...splitSource, method: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="transfer">โอนเงิน</option>
                  <option value="cash">เงินสด</option>
                  <option value="credit">เครดิต</option>
                </select>
              </div>
              <div className="flex items-end">
                <div className="bg-blue-50 rounded-xl px-4 py-2 flex-1 text-center">
                  <p className="text-xs text-blue-500">ยอดที่ตัดทั้งหมด</p>
                  <p className="text-xl font-bold text-[#185FA5]">฿{splitTotal.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-500 mb-2">
                <span className="col-span-2">ลูกค้า / เลขจอง</span>
                <span>วันที่</span>
                <span>ยอดรวม</span>
                <span className="col-span-2">ยอดที่ตัด (บาท)</span>
              </div>
              {splitPayments.map((sp, i) => (
                <div key={sp.booking_id} className={`grid grid-cols-6 gap-2 px-3 py-2.5 rounded-lg mb-1.5 items-center border transition-colors ${sp.selected ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'}`}>
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" checked={sp.selected}
                      onChange={(e) => {
                        const updated = [...splitPayments]
                        updated[i].selected = e.target.checked
                        setSplitPayments(updated)
                      }}
                      className="rounded border-gray-300"/>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{sp.customer_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{sp.case_number}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{sp.booking_date}</span>
                  <span className="text-xs font-medium text-gray-700">{sp.grand_total > 0 ? `฿${sp.grand_total.toLocaleString()}` : '-'}</span>
                  <div className="col-span-2">
                    <input type="text" inputMode="numeric"
                      value={sp.amount || ''}
                      disabled={!sp.selected}
                      onChange={(e) => {
                        const updated = [...splitPayments]
                        updated[i].amount = Number(e.target.value.replace(/\D/g,''))
                        setSplitPayments(updated)
                      }}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] disabled:bg-gray-50 disabled:text-gray-300"/>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowSplitModal(false)} className="px-5 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleSplitSave}
                disabled={splitPayments.filter(s => s.selected && s.amount > 0).length === 0}
                className="px-5 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50 font-medium transition-colors">
                บันทึก ({splitPayments.filter(s => s.selected).length} รายการ)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}