'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPrinter, IconSearch, IconDownload } from '@tabler/icons-react'

export default function Invoices() {
  const { user, role, ready, logout } = useAuth('/invoices')
  const [bookings, setBookings] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [pricePerHead, setPricePerHead] = useState(0)
  const [useVat, setUseVat] = useState(false)
  const [vatMode, setVatMode] = useState('exclusive')
  const [billingAddress, setBillingAddress] = useState('')
  const [savingVat, setSavingVat] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const getDefaultFrom = () => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) }
  const [search, setSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(getDefaultFrom())
  const [filterDateTo, setFilterDateTo] = useState('')

  if (ready && !loaded) { fetchBookings(); setLoaded(true) }

  async function fetchBookings(dateFrom?: string, dateTo?: string) {
    let all: any[] = []
    let from = 0
    const df = dateFrom ?? filterDateFrom
    const dt = dateTo ?? filterDateTo
    while (true) {
      let q = supabase.from('bookings')
        .select('*, customers(customer_name, type), medical_cases(*), payments(*)')
        .order('booking_date', { ascending: false })
      if (df) q = q.gte('booking_date', df)
      if (dt) q = q.lte('booking_date', dt)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < 1000) break
      from += 1000
    }
    setBookings(all)
  }

  const handleOpenInvoice = (booking: any) => {
    setSelected(booking)
    const p = booking.payments?.[0]
    const mc = Array.isArray(booking.medical_cases) ? booking.medical_cases?.[0] : booking.medical_cases
    const count = mc?.actual_count || booking.booked_count || 0
    // ถ้ามี price_per_worker บันทึกไว้แล้วในหน้าการเงิน ใช้ค่านั้นก่อน ไม่งั้นคำนวณจากยอดรับจริง/จำนวนคน
    if (p?.price_per_worker > 0) {
      setPricePerHead(p.price_per_worker)
    } else {
      const total = p?.amount_received || 0
      setPricePerHead(count > 0 ? Math.round((total / count) * 100) / 100 : 0)
    }
    setUseVat(p?.use_vat || false)
    setVatMode(p?.vat_mode || 'exclusive')
    setBillingAddress('')
    setShowInvoice(true)
  }

  // บันทึกค่าราคา/VAT ที่ตั้งในใบวางบิล กลับเข้า payments เพื่อให้หน้าการเงินใช้ค่าเดียวกัน
  const handleSyncToPayments = async () => {
    if (!selected) return
    setSavingVat(true)
    const p = selected.payments?.[0]
    const payload = {
      worker_count: actualCount,
      price_per_worker: pricePerHead,
      use_vat: useVat,
      vat_mode: vatMode,
      total_amount: total,
      invoice_no: getInvoiceNo(selected),
    }
    if (p?.id) {
      await supabase.from('payments').update(payload).eq('id', p.id)
    } else {
      await supabase.from('payments').insert([{ ...payload, booking_id: selected.id, customer_id: selected.customer_id, payment_status: 'ยังไม่ชำระ' }])
    }
    setSavingVat(false)
    fetchBookings()
    alert('บันทึกยอดและ VAT เข้าหน้าการเงินแล้ว')
  }

  const getInvoiceNo = (booking: any) => {
    const p = booking.payments?.[0]
    return p?.invoice_no || `INV-${booking.case_number}`
  }

  const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  const mc = selected ? (Array.isArray(selected.medical_cases) ? selected.medical_cases?.[0] : selected.medical_cases) : null
  const actualCount = mc?.actual_count || selected?.booked_count || 0
  const rawTotal = actualCount * pricePerHead
  const subtotal = useVat && vatMode === 'inclusive' ? Math.round((rawTotal / 1.07) * 100) / 100 : rawTotal
  const vatAmount = useVat ? Math.round((rawTotal - subtotal) * 100) / 100 || Math.round(subtotal * 0.07 * 100) / 100 : 0
  const total = useVat && vatMode === 'inclusive' ? rawTotal : Math.round((subtotal + vatAmount) * 100) / 100
  const paid = selected?.payments?.[0]?.amount_received || 0
  const remaining = Math.round((total - paid) * 100) / 100

  const filtered = bookings.filter(b => {
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search)) return false
    if (filterDateFrom && b.booking_date < filterDateFrom) return false
    if (filterDateTo && b.booking_date > filterDateTo) return false
    return true
  })

  const exportExcel = () => {
    const rows = filtered.map(b => {
      const p = b.payments?.[0]
      const mc = (Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)
      const count = mc?.actual_count || b.booked_count || 0
      return {
        'เลขจอง': b.case_number,
        'เลขที่ใบวางบิล': getInvoiceNo(b),
        'ลูกค้า': b.customers?.customer_name,
        'วันที่': b.booking_date,
        'จำนวนตรวจ': count,
        'ยอดรับ': p?.amount_received || 0,
        'สถานะ': p?.payment_status || 'ยังไม่ชำระ',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    XLSX.writeFile(wb, `invoices_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/invoices" onLogout={logout} />

      <div className="flex-1 ml-56 p-6 print:hidden">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">ใบวางบิล</p>
            <p className="text-xs text-gray-400 mt-0.5">ออกใบวางบิลแต่ละ Order</p>
          </div>
          <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <IconDownload size={15} /> Export Excel
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="ค้นหาลูกค้า หรือเลขจอง..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchBookings()}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <button onClick={() => fetchBookings()}
              className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] transition-colors flex-shrink-0">
              ค้นหา
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="flex justify-between items-center pt-1">
            <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
            <button onClick={() => { setSearch(''); setFilterDateFrom(getDefaultFrom()); setFilterDateTo(''); fetchBookings(getDefaultFrom(), '') }}
              className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่</span><span>ยอดรับ</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>
          ) : (
            filtered.map((b) => {
              const p = b.payments?.[0]
              return (
                <div key={b.id} className="grid grid-cols-5 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <span className="font-medium text-gray-700">{b.customers?.customer_name}</span>
                  <span className="text-gray-500">{b.booking_date}</span>
                  <span className="text-gray-700">{p?.amount_received ? `฿${p.amount_received.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}</span>
                  <button onClick={() => handleOpenInvoice(b)} className="flex items-center gap-1.5 text-xs text-[#185FA5] hover:underline justify-end">
                    <IconPrinter size={13} /> ออกใบวางบิล
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showInvoice && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:bg-white print:block">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto print:shadow-none print:rounded-none print:max-h-none">
            <div className="p-10">
              <div className="flex justify-between items-start pb-6 border-b-2 border-[#185FA5] mb-8">
                <div>
                  <p className="text-2xl font-medium text-[#185FA5]">Txrx Service</p>
                  <p className="text-xs text-gray-400 mt-1">บริการตรวจสุขภาพแรงงานต่างด้าว</p>
                </div>
                <div className="text-right">
                  <div className="bg-[#185FA5] text-white px-4 py-1.5 rounded-lg mb-2 inline-block">
                    <p className="text-sm font-medium">ใบวางบิล</p>
                  </div>
                  <p className="text-xs font-medium text-gray-600">{getInvoiceNo(selected)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{today}</p>
                </div>
              </div>

              <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-[#E6F1FB] rounded-xl p-4">
                  <p className="text-xs font-medium text-[#185FA5] mb-2">เรียกเก็บจาก</p>
                  <p className="font-medium text-gray-800">{selected.customers?.customer_name}</p>
                  {selected.customers?.type === 'credit' && (
                    <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full mt-1 inline-block">เครดิต</span>
                  )}
                  {/* ที่อยู่วางบิล */}
                  <div className="mt-3 print:hidden">
                    <label className="text-xs text-[#185FA5] mb-1 block">ที่อยู่วางบิล</label>
                    <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}
                      rows={3} placeholder="กรอกที่อยู่สำหรับออกใบวางบิล..."
                      className="w-full border border-blue-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                  </div>
                  {billingAddress && <p className="text-xs text-gray-600 mt-2 whitespace-pre-line print:block hidden">{billingAddress}</p>}
                </div>
                <div className="flex-1 bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">รายละเอียด</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">เลขที่จอง</span>
                      <span className="text-gray-700 font-mono">{selected.case_number}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">วันที่ตรวจ</span>
                      <span className="text-gray-700">{selected.booking_date}</span>
                    </div>
                    {selected.location_name && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">สถานที่</span>
                        <span className="text-gray-700">{selected.location_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-gray-100 mb-6">
                <div className="grid grid-cols-4 px-4 py-3 bg-[#185FA5] text-white text-xs font-medium">
                  <span className="col-span-2">รายการ</span>
                  <span className="text-center">ราคา/คน (บาท)</span>
                  <span className="text-right">รวม</span>
                </div>
                <div className="grid grid-cols-4 px-4 py-4 text-sm items-center">
                  <div className="col-span-2">
                    <p className="font-medium text-gray-800">ตรวจสุขภาพแรงงานต่างด้าว</p>
                    <p className="text-xs text-gray-400 mt-0.5">จำนวน {actualCount.toLocaleString()} คน</p>
                  </div>
                  <div className="flex justify-center">
                    <input type="text" inputMode="numeric"
                      value={pricePerHead || ''}
                      onChange={(e) => setPricePerHead(Number(e.target.value.replace(/\D/g,'')))}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#185FA5] print:border-0 print:text-right"
                      placeholder="0" />
                  </div>
                  <p className="text-right font-medium text-gray-800">฿{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
              </div>

              <div className="flex justify-end mb-8">
                <div className="w-72 bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>ยอดก่อน VAT</span><span>฿{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="print:hidden">
                    <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                      <input type="checkbox" checked={useVat} onChange={(e) => setUseVat(e.target.checked)} className="rounded"/>
                      <span className="text-sm text-gray-600">คิด VAT 7%</span>
                    </label>
                    {useVat && (
                      <div className="flex gap-3 pl-6 mb-1.5">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={vatMode === 'exclusive'} onChange={() => setVatMode('exclusive')} className="text-[#185FA5]"/>
                          <span className="text-xs text-gray-600">ราคา + VAT</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={vatMode === 'inclusive'} onChange={() => setVatMode('inclusive')} className="text-[#185FA5]"/>
                          <span className="text-xs text-gray-600">ราคารวม VAT แล้ว</span>
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600 print:flex">
                    <span>VAT 7%</span>
                    <span className={useVat ? 'text-gray-700' : 'text-gray-300'}>฿{vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>ยอดรับชำระแล้ว</span><span className="text-green-600">฿{paid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between font-medium text-base">
                    <span className="text-gray-800">ยอดคงค้าง</span>
                    <span className={remaining > 0 ? 'text-red-500' : 'text-green-600'}>฿{remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 flex justify-between items-center print:hidden">
                <p className="text-xs text-gray-400">ขอบคุณที่ใช้บริการ Txrx Service</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowInvoice(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ปิด</button>
                  <button onClick={handleSyncToPayments} disabled={savingVat}
                    className="px-4 py-2 text-sm border border-[#185FA5] text-[#185FA5] rounded-lg hover:bg-blue-50 disabled:opacity-50">
                    {savingVat ? 'กำลังบันทึก...' : 'บันทึกเข้าหน้าการเงิน'}
                  </button>
                  <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C]">
                    <IconPrinter size={15} /> พิมพ์ / PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}