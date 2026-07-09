'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconSearch, IconPrinter, IconX, IconSettings, IconFileText } from '@tabler/icons-react'

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const DEFAULT_COMPANY = {
  company_name: 'บริษัท ทีเอ็กซ์อาร์เอ็กซ์ เซอร์วิส จำกัด',
  address: 'เลขที่ 65/9 หมู่ 3 ตำบลบางรักน้อย อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000',
  tax_id: '0125567018362',
  phone: '0839964466',
  email: 'thidaratmai69@gmail.com',
  contact_name: 'Thidarat Maikeaw',
}

export default function Invoices() {
  const { user, role, ready, logout } = useAuth('/invoices')
  const [bookings, setBookings] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) })
  const [filterDateTo, setFilterDateTo] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showQuotation, setShowQuotation] = useState(false)
  const [showCompanySettings, setShowCompanySettings] = useState(false)
  const [pricePerHead, setPricePerHead] = useState(0)
  const [useVat, setUseVat] = useState(false)
  const [vatMode, setVatMode] = useState('exclusive')
  const [useWht, setUseWht] = useState(false)
  const [billingAddress, setBillingAddress] = useState('')
  const [customerTaxId, setCustomerTaxId] = useState('')
  const [printName, setPrintName] = useState('')
  const [savingVat, setSavingVat] = useState(false)
  const [company, setCompany] = useState(DEFAULT_COMPANY)
  const [editCompany, setEditCompany] = useState(DEFAULT_COMPANY)
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [quotationNo, setQuotationNo] = useState('')
  const [quotationValidDays, setQuotationValidDays] = useState(7)

  if (ready && !loaded) { fetchAll(); setLoaded(true) }

  async function fetchAll() {
    fetchBookings()
    // โหลดข้อมูลบริษัท
    const { data: cs } = await supabase.from('company_settings').select('*').single()
    if (cs) { setCompany(cs); setEditCompany(cs) }
    // โหลดบัญชีธนาคาร
    const { data: ba } = await supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order')
    if (ba) setBankAccounts(ba)
  }

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

  const generateQuotationNo = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0')
    return `QO-${y}${m}${seq}`
  }

  const handleOpenInvoice = (booking: any) => {
    setSelected(booking)
    const p = getP(booking)
    const mc = getMc(booking)
    const count = mc?.actual_count || booking.booked_count || 0
    if (p?.price_per_worker > 0) setPricePerHead(p.price_per_worker)
    else { const total = p?.amount_received || 0; setPricePerHead(count > 0 ? Math.round((total / count) * 100) / 100 : 0) }
    setUseVat(p?.use_vat || false)
    setVatMode(p?.vat_mode || 'exclusive')
    setUseWht(p?.use_wht || false)
    setBillingAddress('')
    setCustomerTaxId('')
    setPrintName(booking.customers?.customer_name || '')
    setShowInvoice(true)
  }

  const handleOpenQuotation = (booking: any) => {
    setSelected(booking)
    const p = getP(booking)
    const mc = getMc(booking)
    const count = mc?.actual_count || booking.booked_count || 0
    if (p?.price_per_worker > 0) setPricePerHead(p.price_per_worker)
    else setPricePerHead(0)
    setUseVat(false)
    setVatMode('exclusive')
    setUseWht(false)
    setBillingAddress(booking.customers?.address || '')
    setCustomerTaxId('')
    setPrintName(booking.customers?.customer_name || '')
    setQuotationNo(booking.quotation_no || generateQuotationNo())
    setQuotationValidDays(7)
    setShowQuotation(true)
  }

  const handleSyncToPayments = async () => {
    if (!selected) return
    setSavingVat(true)
    // สำคัญ: เช็คจากฐานข้อมูลจริง "สดๆ" ทุกครั้ง แทนที่จะเชื่อ selected.payments ที่อาจเป็นข้อมูลค้าง
    // (ค้างได้ง่ายมากถ้าเปิด modal นี้ทิ้งไว้แล้วกดบันทึกซ้ำหลายรอบ — เคยทำให้เกิด payment ซ้ำมาแล้ว)
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('booking_id', selected.id)
      .maybeSingle()
    const payload = {
      worker_count: actualCount, price_per_worker: pricePerHead,
      use_vat: useVat, vat_mode: vatMode, use_wht: useWht, wht_amount: whtAmount,
      total_amount: total,
      invoice_no: getInvoiceNo(selected),
    }
    let paymentRow
    if (existing?.id) {
      const { data } = await supabase.from('payments').update(payload).eq('id', existing.id).select().single()
      paymentRow = data
    } else {
      const { data } = await supabase.from('payments')
        .insert([{ ...payload, booking_id: selected.id, customer_id: selected.customer_id, payment_status: 'ยังไม่ชำระ' }])
        .select().single()
      paymentRow = data
    }
    // อัปเดต state ของ selected ให้ตรงกับฐานข้อมูลทันที กันไม่ให้กดซ้ำแล้ว insert อีกรอบ
    if (paymentRow) setSelected((prev: any) => prev ? { ...prev, payments: [paymentRow] } : prev)
    // บันทึก quotation_no ถ้าเปิดจากใบเสนอราคา
    if (showQuotation) await supabase.from('bookings').update({ quotation_no: quotationNo }).eq('id', selected.id)
    setSavingVat(false)
    fetchBookings()
    alert('บันทึกเข้าหน้าการเงินแล้ว')
  }

  const handleSaveCompany = async () => {
    await supabase.from('company_settings').update(editCompany).eq('id', '00000000-0000-0000-0000-000000000001')
    setCompany(editCompany)
    setShowCompanySettings(false)
  }

  const filtered = bookings.filter(b => {
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search)) return false
    return true
  })

  const mc = selected ? getMc(selected) : null
  const p = selected ? getP(selected) : null
  const actualCount = mc?.actual_count || selected?.booked_count || 0
  const rawTotal = actualCount * pricePerHead
  const subtotal = useVat && vatMode === 'inclusive' ? Math.round((rawTotal / 1.07) * 100) / 100 : rawTotal
  const vatAmount = useVat ? (vatMode === 'inclusive' ? Math.round((rawTotal - subtotal) * 100) / 100 : Math.round(subtotal * 0.07 * 100) / 100) : 0
  // ค่าข้าวไฟล์ทบิน — เก็บอยู่บน booking โดยตรง ไม่คิด VAT และไม่เป็นฐานหัก ณ ที่จ่าย
  const mealTotal = selected ? (selected.meal_price || 0) * (selected.meal_count || 0) * (selected.booked_count || 0) : 0
  // หัก ณ ที่จ่าย 3% คิดจาก subtotal (ค่าตรวจก่อน VAT) เท่านั้น เหมือนฐาน VAT
  const whtAmount = useWht ? Math.round(subtotal * 0.03 * 100) / 100 : 0
  const total = (useVat && vatMode === 'inclusive' ? rawTotal : Math.round((subtotal + vatAmount) * 100) / 100) + mealTotal
  const paid = p?.amount_received || 0
  const remaining = Math.round((total - paid - whtAmount) * 100) / 100

  const thaiDateStr = (date?: string) => {
    const d = date ? new Date(date) : new Date()
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
  }

  const validUntilDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + quotationValidDays)
    return thaiDateStr(d.toISOString())
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/invoices" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">ใบวางบิล / ใบเสนอราคา</p>
            <p className="text-xs text-gray-400 mt-0.5">สร้างและพิมพ์เอกสาร</p>
          </div>
          <button onClick={() => setShowCompanySettings(true)}
            className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <IconSettings size={15}/> ข้อมูลบริษัท
          </button>
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
            <button onClick={() => fetchBookings()} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C]">ค้นหา</button>
          </div>
          <div className="flex gap-3 items-end">
            <div><label className="text-xs text-gray-400 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/></div>
            <div><label className="text-xs text-gray-400 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/></div>
            <div className="flex justify-between items-center flex-1">
              <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
              <button onClick={() => { setSearch(''); setFilterDateFrom((() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) })()); setFilterDateTo('') }} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-8 gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span>เลขจอง</span><span className="col-span-2">ลูกค้า</span><span>วันที่</span><span>จำนวน</span><span>ยอดชำระ</span><span className="col-span-2 text-center">เอกสาร</span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>
          ) : filtered.map(b => {
            const bMc = getMc(b); const bP = getP(b)
            const count = bMc?.actual_count || b.booked_count || 0
            const paid = bP?.amount_received || 0; const total = bP?.total_amount || 0
            return (
              <div key={b.id} className="grid grid-cols-8 gap-2 px-5 py-3.5 border-b border-gray-50 text-sm hover:bg-blue-50/30 items-center">
                <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                <span className="col-span-2 font-medium text-gray-800 text-xs">{b.customers?.customer_name}</span>
                <span className="text-gray-500 text-xs">{b.booking_date}</span>
                <span className="text-gray-600 text-xs">{count} คน</span>
                <span className="text-xs">{paid > 0 ? <span className="text-green-600">฿{fmt(paid)}</span> : <span className="text-gray-300">-</span>}</span>
                <div className="col-span-2 flex gap-2 justify-center">
                  <button onClick={() => handleOpenInvoice(b)} className="text-xs bg-[#185FA5] text-white px-3 py-1 rounded-lg hover:bg-[#0C447C]">
                    ใบวางบิล
                  </button>
                  <button onClick={() => handleOpenQuotation(b)} className="text-xs border border-[#185FA5] text-[#185FA5] px-3 py-1 rounded-lg hover:bg-blue-50 flex items-center gap-1">
                    <IconFileText size={12}/> ใบเสนอราคา
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== Modal ใบวางบิล ===== */}
      {showInvoice && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:p-0 print:bg-white print:items-start">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto print:rounded-none print:shadow-none print:max-h-none print:overflow-visible">
            <div className="p-8 print:p-6">
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
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-500 font-semibold mb-2">เรียกเก็บจาก</p>
                  <input value={printName} onChange={(e) => setPrintName(e.target.value)}
                    className="text-lg font-bold text-blue-900 bg-transparent border-b-2 border-blue-200 focus:outline-none focus:border-blue-500 w-full print:border-0 mb-1" placeholder="ชื่อที่แสดงบนใบวางบิล"/>
                  <p className="text-xs text-blue-300 print:hidden mb-2">(ชื่อในระบบ: {selected?.customers?.customer_name})</p>
                  <p className="text-xs text-blue-500 font-semibold mb-1">ที่อยู่</p>
                  <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} placeholder="พิมพ์ที่อยู่..."
                    className="w-full text-sm text-blue-900 bg-white/70 border border-blue-200 rounded-lg px-3 py-2 focus:outline-none resize-none print:border-0 print:bg-transparent print:p-0"/>
                  <p className="text-xs text-blue-500 font-semibold mt-2 mb-1">เลขที่ภาษี</p>
                  <input value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)}
                    className="w-full text-sm text-blue-900 bg-white/70 border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none print:border-0" placeholder="เลขที่ภาษี (ถ้ามี)"/>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">เลขที่จอง</span><span className="font-medium text-gray-700">{selected.case_number}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">วันที่ตรวจ</span><span className="font-medium text-gray-700">{mc?.exam_date || selected.booking_date}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">สถานที่</span><span className="font-medium text-gray-700">{selected.location_name || '-'}</span></div>
                </div>
              </div>
              <table className="w-full mb-6">
                <thead><tr className="bg-[#185FA5] text-white">
                  <th className="text-left px-4 py-3 text-sm font-semibold rounded-tl-lg">รายการ</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold">ราคา/คน</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold rounded-tr-lg">รวม</th>
                </tr></thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-4"><p className="font-semibold text-gray-800">ตรวจสุขภาพแรงงานต่างด้าว</p><p className="text-sm text-gray-500">จำนวน {actualCount} คน</p></td>
                    <td className="px-4 py-4 text-right">
                      <input type="text" inputMode="numeric" value={pricePerHead || ''} onChange={(e) => setPricePerHead(Number(e.target.value.replace(/\D/g,'')))} placeholder="0"
                        className="w-32 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] print:border-0 print:p-0"/>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-gray-800">฿{fmt(rawTotal)}</td>
                  </tr>
                  {mealTotal > 0 && (
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-800">✈️ ค่าอาหารระหว่างเดินทาง (ไฟล์ทบิน)</p>
                        <p className="text-sm text-gray-500">฿{selected.meal_price} x {selected.meal_count} มื้อ x {selected.booked_count} คน</p>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-gray-400">-</td>
                      <td className="px-4 py-4 text-right font-semibold text-gray-800">฿{fmt(mealTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="flex justify-end mb-4">
                <div className="w-72 space-y-2">
                  <div className="print:hidden border border-gray-100 rounded-xl p-3 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input type="checkbox" checked={useVat} onChange={(e) => setUseVat(e.target.checked)} className="rounded"/>
                      <span className="text-xs font-medium text-gray-700">คิด VAT 7% (เฉพาะยอดตรวจ)</span>
                    </label>
                    {useVat && <div className="flex gap-3 pl-6 mb-2">
                      <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={vatMode === 'exclusive'} onChange={() => setVatMode('exclusive')}/><span className="text-xs text-gray-600">ราคา + VAT</span></label>
                      <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={vatMode === 'inclusive'} onChange={() => setVatMode('inclusive')}/><span className="text-xs text-gray-600">ราคารวม VAT</span></label>
                    </div>}
                    <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-gray-100">
                      <input type="checkbox" checked={useWht} onChange={(e) => setUseWht(e.target.checked)} className="rounded"/>
                      <span className="text-xs font-medium text-gray-700">หัก ณ ที่จ่าย 3% (จากยอดตรวจก่อน VAT)</span>
                    </label>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600"><span>ยอดก่อน VAT (ค่าตรวจ)</span><span>฿{fmt(subtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className={useVat ? 'text-gray-600' : 'text-gray-300'}>VAT 7%</span><span className={useVat ? 'text-gray-600' : 'text-gray-300'}>฿{fmt(vatAmount)}</span></div>
                  {mealTotal > 0 && (
                    <div className="flex justify-between text-sm text-sky-600"><span>✈️ ค่าข้าวไฟล์ทบิน (ไม่รวม VAT)</span><span>฿{fmt(mealTotal)}</span></div>
                  )}
                  {whtAmount > 0 && (
                    <div className="flex justify-between text-sm text-rose-600"><span>หัก ณ ที่จ่าย 3%</span><span>- ฿{fmt(whtAmount)}</span></div>
                  )}
                  <div className="flex justify-between text-sm text-gray-600 border-t border-gray-100 pt-2"><span>ยอดรับชำระแล้ว</span><span className="text-green-600">฿{fmt(paid)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t-2 border-[#185FA5] pt-2"><span>ยอดคงค้าง</span><span className={remaining > 0 ? 'text-red-500' : 'text-green-600'}>฿{fmt(remaining)}</span></div>
                </div>
              </div>
              {/* ช่องทางชำระ */}
              {bankAccounts.length > 0 && (
                <div className="border-t border-gray-100 pt-4 mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">ช่องทางการชำระเงิน</p>
                  <div className="grid grid-cols-2 gap-3">
                    {bankAccounts.map(ba => (
                      <div key={ba.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-gray-700">{ba.bank_name}</p>
                        <p className="text-sm font-mono text-gray-800">{ba.account_number}</p>
                        <p className="text-xs text-gray-500">{ba.account_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t border-gray-100 pt-4 flex justify-between items-center print:hidden">
                <p className="text-xs text-gray-400">ขอบคุณที่ใช้บริการ Txrx Service</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowInvoice(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ปิด</button>
                  <button onClick={handleSyncToPayments} disabled={savingVat} className="px-4 py-2 text-sm border border-[#185FA5] text-[#185FA5] rounded-lg hover:bg-blue-50 disabled:opacity-50">
                    {savingVat ? 'กำลังบันทึก...' : 'บันทึกเข้าหน้าการเงิน'}
                  </button>
                  <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C]">
                    <IconPrinter size={15}/> พิมพ์ / PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal ใบเสนอราคา ===== */}
      {showQuotation && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:p-0 print:bg-white print:items-start">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto print:rounded-none print:shadow-none print:max-h-none print:overflow-visible">
            <div className="p-8 print:p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-[#185FA5] rounded-xl flex items-center justify-center text-white font-bold text-lg">TX</div>
                  <div>
                    <p className="text-xs text-gray-400">EST.2024</p>
                    <p className="font-bold text-[#185FA5]">TXRX</p>
                    <p className="text-xs text-gray-500">Service</p>
                  </div>
                </div>
                <div className="text-right">
                  <h1 className="text-4xl font-bold text-[#185FA5] mb-2">ใบเสนอราคา</h1>
                  <p className="text-xs text-gray-400">(ต้นฉบับ)</p>
                </div>
              </div>

              {/* ข้อมูลผู้ขายและลูกค้า */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="flex items-center gap-1 mb-1"><span className="text-xs font-semibold text-gray-700">ผู้ขาย :</span><span className="text-xs text-gray-600">{company.company_name}</span></div>
                  <div className="flex items-start gap-1 mb-1"><span className="text-xs font-semibold text-gray-700 flex-shrink-0">ที่อยู่ :</span><span className="text-xs text-gray-600">{company.address}</span></div>
                  <div className="flex items-center gap-1"><span className="text-xs font-semibold text-gray-700">เลขที่ภาษี :</span><span className="text-xs text-gray-600">{company.tax_id}</span></div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div><p className="text-xs text-gray-500 mb-0.5">เลขที่เอกสาร :</p>
                      <input value={quotationNo} onChange={(e) => setQuotationNo(e.target.value)} className="text-xs font-mono bg-white border border-blue-200 rounded px-2 py-1 w-full focus:outline-none print:border-0 print:bg-transparent"/></div>
                    <div><p className="text-xs text-gray-500 mb-0.5">วันที่ออก :</p><p className="text-xs font-medium">{thaiDateStr()}</p></div>
                    <div><p className="text-xs text-gray-500 mb-0.5">ใช้ได้ถึง :</p><p className="text-xs font-medium">{validUntilDate()}</p></div>
                    <div className="print:hidden"><p className="text-xs text-gray-500 mb-0.5">ใช้ได้ (วัน) :</p>
                      <input type="number" value={quotationValidDays} onChange={(e) => setQuotationValidDays(Number(e.target.value))} className="text-xs border border-blue-200 rounded px-2 py-1 w-full focus:outline-none"/></div>
                  </div>
                </div>
              </div>

              {/* ลูกค้า */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">ลูกค้า :</p>
                    <input value={printName} onChange={(e) => setPrintName(e.target.value)}
                      className="text-sm font-bold text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-[#185FA5] print:border-0 print:bg-transparent"/>
                    <p className="text-xs text-gray-400 print:hidden mt-1">(ชื่อในระบบ: {selected?.customers?.customer_name})</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">ที่อยู่ :</p>
                    <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} placeholder="พิมพ์ที่อยู่..."
                      className="text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-full focus:outline-none resize-none print:border-0 print:bg-transparent"/>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">เลขที่ภาษี :</p>
                    <input value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} placeholder="เลขที่ภาษี (ถ้ามี)"
                      className="text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-full focus:outline-none print:border-0"/>
                  </div>
                </div>
              </div>

              {/* ตารางรายการ */}
              <table className="w-full mb-6 border-collapse">
                <thead><tr className="bg-[#185FA5] text-white text-sm">
                  <th className="text-left px-4 py-3 rounded-tl-lg">คำอธิบาย</th>
                  <th className="text-right px-4 py-3">จำนวน</th>
                  <th className="text-right px-4 py-3">ราคา</th>
                  <th className="text-right px-4 py-3">ส่วนลด</th>
                  <th className="text-right px-4 py-3">VAT</th>
                  <th className="text-right px-4 py-3 rounded-tr-lg">มูลค่าก่อนภาษี</th>
                </tr></thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-800">ตรวจสุขภาพแรงงานต่างด้าว</p>
                      <p className="text-xs text-gray-500">{selected.case_number}</p>
                    </td>
                    <td className="px-4 py-4 text-right text-sm">{actualCount}.00</td>
                    <td className="px-4 py-4 text-right">
                      <input type="text" inputMode="numeric" value={pricePerHead || ''} onChange={(e) => setPricePerHead(Number(e.target.value.replace(/\D/g,'')))} placeholder="0"
                        className="w-28 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#185FA5] print:border-0"/>
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-gray-500">0.00</td>
                    <td className="px-4 py-4 text-right text-sm">
                      <label className="flex items-center gap-1 justify-end print:hidden cursor-pointer">
                        <input type="checkbox" checked={useVat} onChange={(e) => setUseVat(e.target.checked)} className="rounded"/>
                        <span className="text-xs">{useVat ? 'มี' : 'ไม่มี'}</span>
                      </label>
                      <span className="hidden print:block text-sm">{useVat ? 'มี' : 'ไม่มี'}</span>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-gray-800">{fmt(subtotal)}</td>
                  </tr>
                  {mealTotal > 0 && (
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-800">✈️ ค่าอาหารระหว่างเดินทาง (ไฟล์ทบิน)</p>
                        <p className="text-xs text-gray-500">฿{selected.meal_price} x {selected.meal_count} มื้อ x {selected.booked_count} คน</p>
                      </td>
                      <td className="px-4 py-4 text-right text-sm">1.00</td>
                      <td className="px-4 py-4 text-right text-sm text-gray-400">-</td>
                      <td className="px-4 py-4 text-right text-sm text-gray-500">0.00</td>
                      <td className="px-4 py-4 text-right text-sm">ไม่มี</td>
                      <td className="px-4 py-4 text-right font-semibold text-gray-800">{fmt(mealTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* สรุปยอด */}
              <div className="flex justify-between items-start mb-6">
                <div className="w-1/2">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">สรุป</p>
                    <div className="flex justify-between text-xs text-gray-600 mb-1"><span>มูลค่าไม่มีหรือยกเว้นภาษี</span><span>{fmt(subtotal + mealTotal)} บาท</span></div>
                    {whtAmount > 0 && (
                      <div className="flex justify-between text-xs text-rose-600 mb-1"><span>หัก ณ ที่จ่าย 3%</span><span>-{fmt(whtAmount)} บาท</span></div>
                    )}
                  </div>
                </div>
                <div className="w-80">
                  <div className="flex justify-between mb-1"><span className="text-sm font-bold text-gray-700">จำนวนเงินทั้งสิ้น</span><span className="text-lg font-bold text-[#185FA5]">{fmt(total)} บาท</span></div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1"><span>จำนวนเงินที่ถูกหัก ณ ที่จ่าย</span><span>{fmt(whtAmount)} บาท</span></div>
                  <div className="flex justify-between text-sm font-semibold text-gray-700 border-t border-gray-200 pt-1"><span>จำนวนเงินที่ชำระ</span><span>{fmt(Math.round((total - whtAmount) * 100) / 100)} บาท</span></div>
                </div>
              </div>

              {/* ช่องทางชำระ */}
              {bankAccounts.length > 0 && (
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">💳 ชำระเงิน</p>
                  <div className="grid grid-cols-2 gap-3">
                    {bankAccounts.map(ba => (
                      <div key={ba.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#185FA5] rounded-lg flex items-center justify-center text-white text-xs font-bold">{ba.bank_name.slice(0,2)}</div>
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{ba.bank_name}</p>
                          <p className="text-sm font-mono text-gray-800">{ba.account_number}</p>
                          <p className="text-xs text-gray-500">{ba.account_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ลายเซ็น */}
              <div className="border-t border-gray-200 pt-4 mb-4">
                <p className="text-xs text-gray-500 mb-3">รับรอง สแกนเพื่อเปิดด้วยเว็บไซต์ ผู้ออกเอกสาร (ผู้ขาย) ผู้อนุมัติเอกสาร (ผู้ขาย) ตราประทับ (ผู้ขาย) ผู้รับเอกสาร (ลูกค้า) ตราประทับ (ลูกค้า)</p>
                <div className="grid grid-cols-4 gap-4">
                  {[{ label: company.contact_name, sublabel: 'Thidarat Maikeaw', date: thaiDateStr() },
                    { label: company.contact_name, sublabel: 'Thidarat Maikeaw', date: thaiDateStr() },
                    { label: '', sublabel: '', date: '' },
                    { label: selected?.customers?.customer_name || '', sublabel: '', date: '' }
                  ].map((sig, i) => (
                    <div key={i} className="text-center border-t-2 border-gray-300 pt-2 mt-8">
                      <p className="text-xs font-medium text-gray-700">{sig.label}</p>
                      {sig.sublabel && <p className="text-xs text-gray-500">{sig.sublabel}</p>}
                      {sig.date && <p className="text-xs text-gray-400">{sig.date}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center print:hidden">
                <p className="text-xs text-gray-400">หมายเหตุ: -</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowQuotation(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ปิด</button>
                  <button onClick={handleSyncToPayments} disabled={savingVat} className="px-4 py-2 text-sm border border-[#185FA5] text-[#185FA5] rounded-lg hover:bg-blue-50 disabled:opacity-50">
                    {savingVat ? 'กำลังบันทึก...' : 'บันทึกเข้าหน้าการเงิน'}
                  </button>
                  <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C]">
                    <IconPrinter size={15}/> พิมพ์ / PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal ตั้งค่าข้อมูลบริษัท ===== */}
      {showCompanySettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <p className="text-base font-semibold text-gray-800">ข้อมูลบริษัท</p>
              <button onClick={() => setShowCompanySettings(false)} className="text-gray-400 hover:text-gray-600"><IconX size={20}/></button>
            </div>
            <div className="p-6 space-y-3">
              {[
                { label: 'ชื่อบริษัท', key: 'company_name' },
                { label: 'ที่อยู่', key: 'address', textarea: true },
                { label: 'เลขที่ภาษี', key: 'tax_id' },
                { label: 'เบอร์โทร', key: 'phone' },
                { label: 'อีเมล', key: 'email' },
                { label: 'ชื่อผู้ติดต่อ', key: 'contact_name' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  {f.textarea ? (
                    <textarea value={(editCompany as any)[f.key]} onChange={(e) => setEditCompany({...editCompany, [f.key]: e.target.value})} rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] resize-none"/>
                  ) : (
                    <input value={(editCompany as any)[f.key]} onChange={(e) => setEditCompany({...editCompany, [f.key]: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                  )}
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowCompanySettings(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
              <button onClick={handleSaveCompany} className="px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C]">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}