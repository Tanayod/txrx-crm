'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconSearch, IconPrinter, IconX } from '@tabler/icons-react'

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Invoices() {
  const { user, role, ready, logout } = useAuth('/invoices')
  const [bookings, setBookings] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) })
  const [filterDateTo, setFilterDateTo] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [pricePerHead, setPricePerHead] = useState(0)
  const [useVat, setUseVat] = useState(false)
  const [vatMode, setVatMode] = useState('exclusive')
  const [billingAddress, setBillingAddress] = useState('')
  const [printName, setPrintName] = useState('')
  const [savingVat, setSavingVat] = useState(false)

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

  const getMc = (b: any) => Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
  const getP = (b: any) => Array.isArray(b.payments) ? b.payments?.[0] : b.payments

  const getInvoiceNo = (b: any) => {
    const p = getP(b)
    if (p?.invoice_no && !p.invoice_no.startsWith('INV-TXR')) return p.invoice_no
    return `INV-${b.case_number}`
  }

  const handleOpenInvoice = (booking: any) => {
    setSelected(booking)
    const p = getP(booking)
    const mc = getMc(booking)
    const count = mc?.actual_count || booking.booked_count || 0
    if (p?.price_per_worker > 0) {
      setPricePerHead(p.price_per_worker)
    } else {
      const total = p?.amount_received || 0
      setPricePerHead(count > 0 ? Math.round((total / count) * 100) / 100 : 0)
    }
    setUseVat(p?.use_vat || false)
    setVatMode(p?.vat_mode || 'exclusive')
    setBillingAddress('')
    setPrintName(booking.customers?.customer_name || '')
    setShowInvoice(true)
  }

  const handleSyncToPayments = async () => {
    if (!selected) return
    setSavingVat(true)
    const p = getP(selected)
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

  const filtered = bookings.filter(b => {
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search)) return false
    return true
  })

  const clearFilters = () => {
    const df = (() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) })()
    setSearch(''); setFilterDateFrom(df); setFilterDateTo('')
    fetchBookings(df, '')
  }

  // คำนวณ invoice
  const mc = getMc(selected)
  const p = getP(selected)
  const actualCount = mc?.actual_count || selected?.booked_count || 0
  const rawTotal = actualCount * pricePerHead
  const subtotal = useVat && vatMode === 'inclusive' ? Math.round((rawTotal / 1.07) * 100) / 100 : rawTotal
  const vatAmount = useVat
    ? (vatMode === 'inclusive' ? Math.round((rawTotal - subtotal) * 100) / 100 : Math.round(subtotal * 0.07 * 100) / 100)
    : 0
  const total = useVat && vatMode === 'inclusive' ? rawTotal : Math.round((subtotal + vatAmount) * 100) / 100
  const paid = p?.amount_received || 0
  const remaining = Math.round((total - paid) * 100) / 100

  const thaiDateStr = () => {
    const d = new Date()
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/invoices" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <p className="text-base font-medium text-gray-800">ใบวางบิล</p>
          <p className="text-xs text-gray-400 mt-0.5">สร้างและพิมพ์ใบวางบิล</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm space-y-3">
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
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div className="flex items-end justify-between flex-1">
              <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
              <button onClick={clearFilters} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span>เลขจอง</span><span className="col-span-2">ลูกค้า</span>
            <span>วันที่</span><span>จำนวน</span><span>ยอดชำระ</span><span>สถานะ</span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>
          ) : filtered.map(b => {
            const bMc = getMc(b)
            const bP = getP(b)
            const count = bMc?.actual_count || b.booked_count || 0
            const paid = bP?.amount_received || 0
            const total = bP?.total_amount || 0
            const remaining = total - paid
            return (
              <div key={b.id} className="grid grid-cols-7 gap-2 px-5 py-3.5 border-b border-gray-50 text-sm hover:bg-blue-50/30 transition-colors items-center">
                <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                <span className="col-span-2 font-medium text-gray-800 text-xs">{b.customers?.customer_name}</span>
                <span className="text-gray-500 text-xs">{b.booking_date}</span>
                <span className="text-gray-600 text-xs">{count} คน</span>
                <span className="text-xs">
                  {paid > 0 && <span className="text-green-600 font-medium">฿{fmt(paid)}</span>}
                  {remaining > 0 && <span className="text-red-500 ml-1">ค้าง ฿{fmt(remaining)}</span>}
                  {paid === 0 && total === 0 && <span className="text-gray-300">-</span>}
                </span>
                <button onClick={() => handleOpenInvoice(b)}
                  className="text-xs bg-[#185FA5] text-white px-3 py-1 rounded-lg hover:bg-[#0C447C] transition-colors w-fit">
                  ออกใบวางบิล
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {showInvoice && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:p-0 print:bg-white print:items-start">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto print:rounded-none print:shadow-none print:max-h-none print:overflow-visible">
            {/* Invoice Content */}
            <div className="p-8 print:p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-[#185FA5]">Txrx Service</h1>
                  <p className="text-sm text-gray-500 mt-1">บริการตรวจสุขภาพแรงงานต่างด้าว</p>
                </div>
                <div className="text-right">
                  <span className="bg-[#185FA5] text-white text-sm font-bold px-4 py-2 rounded-lg">ใบวางบิล</span>
                  <p className="text-sm text-gray-600 mt-2">{getInvoiceNo(selected)}</p>
                  <p className="text-sm text-gray-500">{thaiDateStr()}</p>
                </div>
              </div>

              <hr className="border-[#185FA5] border-2 mb-6"/>

              {/* Billing Info */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-500 font-semibold mb-2">เรียกเก็บจาก</p>

                  {/* ชื่อที่แก้ไขได้สำหรับการพิมพ์ */}
                  <input
                    value={printName}
                    onChange={(e) => setPrintName(e.target.value)}
                    className="text-lg font-bold text-blue-900 bg-transparent border-b-2 border-blue-200 focus:outline-none focus:border-blue-500 w-full print:border-0 mb-1"
                    placeholder="ชื่อที่แสดงบนใบวางบิล"
                  />
                  <p className="text-xs text-blue-300 print:hidden mb-2">(ชื่อในระบบ: {selected?.customers?.customer_name})</p>

                  <p className="text-xs text-blue-500 font-semibold mb-1">ที่อยู่วางบิล</p>
                  <textarea
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    rows={3}
                    placeholder="พิมพ์ที่อยู่ที่นี่..."
                    className="w-full text-sm text-blue-900 bg-white/70 border border-blue-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none print:border-0 print:bg-transparent print:p-0"
                  />
                  {billingAddress && <p className="text-sm text-blue-900 hidden print:block whitespace-pre-line">{billingAddress}</p>}
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">เลขที่จอง</span>
                    <span className="font-medium text-gray-700">{selected.case_number}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">วันที่ตรวจ</span>
                    <span className="font-medium text-gray-700">{mc?.exam_date || selected.booking_date}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">สถานที่</span>
                    <span className="font-medium text-gray-700">{selected.location_name || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full mb-6">
                <thead>
                  <tr className="bg-[#185FA5] text-white">
                    <th className="text-left px-4 py-3 text-sm font-semibold rounded-tl-lg">รายการ</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold">ราคา/คน (บาท)</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold rounded-tr-lg">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-800">ตรวจสุขภาพแรงงานต่างด้าว</p>
                      <p className="text-sm text-gray-500">จำนวน {actualCount} คน</p>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pricePerHead || ''}
                        onChange={(e) => setPricePerHead(Number(e.target.value.replace(/\D/g,'')))}
                        placeholder="0"
                        className="w-32 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] print:border-0 print:p-0"
                      />
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-gray-800">฿{fmt(rawTotal)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Summary */}
              <div className="flex justify-end mb-6">
                <div className="w-72 space-y-2">
                  {/* VAT toggle — ซ่อนตอนพิมพ์ */}
                  <div className="print:hidden border border-gray-100 rounded-xl p-3 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input type="checkbox" checked={useVat} onChange={(e) => setUseVat(e.target.checked)} className="rounded border-gray-300"/>
                      <span className="text-xs font-medium text-gray-700">คิด VAT 7%</span>
                    </label>
                    {useVat && (
                      <div className="flex gap-3 pl-6">
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

                  <div className="flex justify-between text-sm text-gray-600">
                    <span>ยอดก่อน VAT</span>
                    <span>฿{fmt(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={useVat ? 'text-gray-600' : 'text-gray-300'}>VAT 7%</span>
                    <span className={useVat ? 'text-gray-600' : 'text-gray-300'}>฿{fmt(vatAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 border-t border-gray-100 pt-2">
                    <span>ยอดรับชำระแล้ว</span>
                    <span className="text-green-600">฿{fmt(paid)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t-2 border-[#185FA5] pt-2">
                    <span>ยอดคงค้าง</span>
                    <span className={remaining > 0 ? 'text-red-500' : 'text-green-600'}>฿{fmt(remaining)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
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
              <div className="hidden print:block text-center pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-400">ขอบคุณที่ใช้บริการ Txrx Service</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}