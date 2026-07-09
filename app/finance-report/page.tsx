'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconSearch, IconDownload, IconRefresh } from '@tabler/icons-react'

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FinanceReport() {
  const { user, role, ready, logout } = useAuth('/finance-report')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const getDefaultFrom = () => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10) }
  const [filterDateFrom, setFilterDateFrom] = useState(getDefaultFrom())
  const [filterDateTo, setFilterDateTo] = useState(new Date().toISOString().slice(0,10))
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSlip, setFilterSlip] = useState('')

  if (ready && !loaded) { fetchReport(); setLoaded(true) }

  async function fetchReport() {
    setLoading(true)

    // ดึง bookings พร้อม payments แยก payment_slips ออก
    // เพิ่ม wht_amount, credit_used เพื่อคำนวณ "ยอดที่ควรได้รับสุทธิ" ให้ถูกต้อง
    let all: any[] = []
    let from = 0
    while (true) {
      let q = supabase.from('bookings')
        .select('id, case_number, booking_date, booked_count, location_name, customers(customer_name, type), medical_cases(actual_count), payments(id, total_amount, amount_received, payment_status, method, invoice_no, ref_no, wht_amount, credit_used, credit_deposited)')
        .order('booking_date', { ascending: false })
      if (filterDateFrom) q = q.gte('booking_date', filterDateFrom)
      if (filterDateTo) q = q.lte('booking_date', filterDateTo)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < 1000) break
      from += 1000
    }

    // ดึง payment_slips แยก เพื่อหลีกเลี่ยงปัญหา nested join
    const paymentIds = all.flatMap((b: any) => {
      const p = Array.isArray(b.payments) ? b.payments?.[0] : b.payments
      return p?.id ? [p.id] : []
    })

    const slipSet = new Set<string>()
    const slipCountMap: any = {}
    if (paymentIds.length > 0) {
      const { data: slipsData } = await supabase
        .from('payment_slips')
        .select('payment_id')
        .in('payment_id', paymentIds)
      slipsData?.forEach((s: any) => {
        slipSet.add(s.payment_id)
        slipCountMap[s.payment_id] = (slipCountMap[s.payment_id] || 0) + 1
      })
    }

    // แปลงข้อมูลและคำนวณ
    const mapped = all.map((b: any) => {
      const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
      const p = Array.isArray(b.payments) ? b.payments?.[0] : b.payments
      const total = p?.total_amount || 0
      const received = p?.amount_received || 0
      const whtAmount = p?.wht_amount || 0
      const creditUsed = p?.credit_used || 0
      // ยอดที่ควรได้รับสุทธิ = ยอดรวม - หัก ณ ที่จ่าย - เครดิตที่นำมาหัก (ทั้งสองอย่างนี้ไม่ใช่เงินสดที่ต้องรับ)
      const netExpected = Math.max(Math.round((total - whtAmount - creditUsed) * 100) / 100, 0)
      const diff = Math.round((received - netExpected) * 100) / 100
      const status = p?.payment_status || 'ยังไม่ชำระ'
      const hasSlip = p?.id ? slipSet.has(p.id) : false
      const slipCount = p?.id ? (slipCountMap[p.id] || 0) : 0

      let payType = 'ยังไม่ชำระ'
      if (status === 'ชำระเงินแล้ว') {
        if (diff > 0.01) payType = 'ชำระเกิน'
        else if (diff < -0.01) payType = 'ชำระขาด'
        else payType = 'ชำระครบ'
      } else if (status === 'เครดิต') payType = 'เครดิต'
      else if (status === 'ค้างชำระ') payType = 'ค้างชำระ'

      return {
        id: b.id,
        case_number: b.case_number,
        booking_date: b.booking_date,
        customer_name: b.customers?.customer_name || '-',
        location_name: b.location_name || '-',
        actual_count: mc?.actual_count || b.booked_count || 0,
        total_amount: total,
        wht_amount: whtAmount,
        credit_used: creditUsed,
        net_expected: netExpected,
        amount_received: received,
        diff,
        payment_status: status,
        pay_type: payType,
        method: p?.method || '-',
        invoice_no: p?.invoice_no || '-',
        ref_no: p?.ref_no || '-',
        has_slip: hasSlip,
        slip_count: slipCount,
      }
    })

    setRows(mapped)
    setLoading(false)
  }

  const handleSearch = () => { setLoaded(false) }

  const filtered = rows.filter(r => {
    if (filterCustomer && !r.customer_name.includes(filterCustomer)) return false
    if (filterStatus && r.pay_type !== filterStatus) return false
    if (filterSlip === 'มี' && !r.has_slip) return false
    if (filterSlip === 'ไม่มี' && r.has_slip) return false
    return true
  })

  const summary = {
    total: filtered.length,
    totalAmount: filtered.reduce((s, r) => s + r.total_amount, 0),
    netExpectedTotal: filtered.reduce((s, r) => s + r.net_expected, 0),
    totalReceived: filtered.reduce((s, r) => s + r.amount_received, 0),
    totalWht: filtered.reduce((s, r) => s + r.wht_amount, 0),
    totalCreditUsed: filtered.reduce((s, r) => s + r.credit_used, 0),
    paid: filtered.filter(r => r.pay_type === 'ชำระครบ').length,
    paidAmount: filtered.filter(r => r.pay_type === 'ชำระครบ').reduce((s, r) => s + r.amount_received, 0),
    unpaid: filtered.filter(r => r.pay_type === 'ยังไม่ชำระ' || r.pay_type === 'ค้างชำระ').length,
    unpaidAmount: filtered.filter(r => r.pay_type === 'ยังไม่ชำระ' || r.pay_type === 'ค้างชำระ').reduce((s, r) => s + r.total_amount, 0),
    credit: filtered.filter(r => r.pay_type === 'เครดิต').length,
    creditAmount: filtered.filter(r => r.pay_type === 'เครดิต').reduce((s, r) => s + (r.total_amount - r.amount_received), 0),
    over: filtered.filter(r => r.pay_type === 'ชำระเกิน').length,
    overAmount: filtered.filter(r => r.pay_type === 'ชำระเกิน').reduce((s, r) => s + r.diff, 0),
    under: filtered.filter(r => r.pay_type === 'ชำระขาด').length,
    underAmount: filtered.filter(r => r.pay_type === 'ชำระขาด').reduce((s, r) => s + Math.abs(r.diff), 0),
    hasSlip: filtered.filter(r => r.has_slip).length,
    noSlip: filtered.filter(r => !r.has_slip).length,
  }

  const payTypeColor: any = {
    'ชำระครบ': 'bg-green-50 text-green-700',
    'ชำระเกิน': 'bg-blue-50 text-blue-700',
    'ชำระขาด': 'bg-orange-50 text-orange-700',
    'ยังไม่ชำระ': 'bg-gray-100 text-gray-500',
    'ค้างชำระ': 'bg-red-50 text-red-600',
    'เครดิต': 'bg-amber-50 text-amber-600',
  }

  const exportExcel = () => {
    const exRows = filtered.map(r => ({
      'เลขจอง': r.case_number, 'วันที่': r.booking_date,
      'ลูกค้า': r.customer_name, 'สถานที่': r.location_name,
      'จำนวน (คน)': r.actual_count, 'ยอดรวม (บาท)': r.total_amount,
      'หัก ณ ที่จ่าย': r.wht_amount, 'เครดิตที่ใช้หัก': r.credit_used,
      'ยอดที่ควรได้รับสุทธิ': r.net_expected,
      'รับชำระจริง (บาท)': r.amount_received, 'ส่วนต่าง': r.diff,
      'สถานะ': r.pay_type, 'วิธีชำระ': r.method,
      'เลขใบวางบิล': r.invoice_no, 'เลขอ้างอิง': r.ref_no,
      'แนบสลิป': r.has_slip ? `มี (${r.slip_count} ไฟล์)` : 'ไม่มี',
    }))
    const ws = XLSX.utils.json_to_sheet(exRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Finance Report')
    XLSX.writeFile(wb, `finance_report_${filterDateFrom}_${filterDateTo}.xlsx`)
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/finance-report" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-5">
          <div>
            <p className="text-base font-semibold text-gray-800">Report การเงิน</p>
            <p className="text-xs text-gray-400 mt-0.5">{filterDateFrom} — {filterDateTo}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <IconDownload size={15}/> Export Excel
            </button>
            <button onClick={handleSearch} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2">
              <IconRefresh size={15}/> โหลดใหม่
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-6 gap-3">
            {[
              { label: 'รายการทั้งหมด', value: summary.total, amount: summary.totalAmount, color: 'text-gray-800' },
              { label: 'ชำระครบ', value: summary.paid, amount: summary.paidAmount, color: 'text-green-600' },
              { label: 'ยังไม่ชำระ/ค้าง', value: summary.unpaid, amount: summary.unpaidAmount, color: 'text-red-500' },
              { label: 'เครดิต (ค้าง)', value: summary.credit, amount: summary.creditAmount, color: 'text-amber-500' },
              { label: 'ชำระเกิน', value: summary.over, amount: summary.overAmount, color: 'text-blue-500', prefix: '+' },
              { label: 'ชำระขาด', value: summary.under, amount: summary.underAmount, color: 'text-orange-500', prefix: '-' },
            ].map((s, i) => (
              <div key={i} className={`text-center ${i > 0 ? 'border-l border-gray-100' : ''}`}>
                <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className={`text-xs mt-0.5 ${s.color}`}>{s.prefix || ''}฿{fmt(s.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* หัก ณ ที่จ่าย / เครดิต Summary */}
        {(summary.totalWht > 0 || summary.totalCreditUsed > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm text-rose-600">💸 หัก ณ ที่จ่าย 3% รวม</span>
              <span className="text-lg font-bold text-rose-600">฿{fmt(summary.totalWht)}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm text-emerald-600">💚 เครดิตที่ใช้หักยอดรวม</span>
              <span className="text-lg font-bold text-emerald-600">฿{fmt(summary.totalCreditUsed)}</span>
            </div>
          </div>
        )}

        {/* Slip Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex justify-between items-center">
            <span className="text-sm text-gray-600">📎 แนบสลิปแล้ว</span>
            <span className="text-lg font-bold text-green-600">{summary.hasSlip} รายการ</span>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex justify-between items-center">
            <span className="text-sm text-gray-600">⚠️ ยังไม่แนบสลิป</span>
            <span className="text-lg font-bold text-red-500">{summary.noSlip} รายการ</span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
          <div className="grid grid-cols-5 gap-3">
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
              <label className="text-xs text-gray-400 mb-1 block">ลูกค้า</label>
              <div className="relative">
                <IconSearch size={13} className="absolute left-2.5 top-2 text-gray-400"/>
                <input value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}
                  placeholder="ค้นหาลูกค้า..."
                  className="w-full pl-7 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานะการชำระ</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="ชำระครบ">ชำระครบ</option>
                <option value="ชำระเกิน">ชำระเกิน</option>
                <option value="ชำระขาด">ชำระขาด</option>
                <option value="ยังไม่ชำระ">ยังไม่ชำระ</option>
                <option value="ค้างชำระ">ค้างชำระ</option>
                <option value="เครดิต">เครดิต</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สลิป</label>
              <select value={filterSlip} onChange={(e) => setFilterSlip(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="มี">แนบสลิปแล้ว</option>
                <option value="ไม่มี">ยังไม่แนบสลิป</option>
              </select>
            </div>
          </div>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
            <p className="text-xs text-gray-400">{loading ? 'กำลังโหลด...' : `แสดง ${filtered.length} จาก ${rows.length} รายการ`}</p>
            <button onClick={() => { setFilterCustomer(''); setFilterStatus(''); setFilterSlip('') }}
              className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-11 gap-2 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
            <span className="col-span-2">เลขจอง / วันที่</span>
            <span className="col-span-2">ลูกค้า / สถานที่</span>
            <span>จำนวน</span>
            <span>ยอดรวม</span>
            <span>ยอดสุทธิที่ควรได้</span>
            <span>รับจริง</span>
            <span>ส่วนต่าง</span>
            <span>สถานะ</span>
            <span>สลิป</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ — ลองกดปุ่ม "โหลดใหม่"</div>
          ) : filtered.map((r, i) => (
            <div key={r.id} className={`grid grid-cols-11 gap-2 px-4 py-3 border-b border-gray-50 text-xs hover:bg-blue-50/20 items-center ${i % 2 !== 0 ? 'bg-gray-50/30' : ''}`}>
              <div className="col-span-2">
                <p className="font-mono text-gray-500">{r.case_number}</p>
                <p className="text-gray-400">{r.booking_date}</p>
              </div>
              <div className="col-span-2">
                <p className="font-medium text-gray-700 truncate">{r.customer_name}</p>
                <p className="text-gray-400 truncate">{r.location_name}</p>
              </div>
              <span className="text-gray-600">{r.actual_count} คน</span>
              <span className="font-medium text-gray-700">{r.total_amount > 0 ? `฿${fmt(r.total_amount)}` : '-'}</span>
              <div>
                <span className="font-medium text-gray-700">{r.net_expected > 0 ? `฿${fmt(r.net_expected)}` : '-'}</span>
                {(r.wht_amount > 0 || r.credit_used > 0) && (
                  <p className="text-gray-400 mt-0.5">
                    {r.wht_amount > 0 && <span>หัก ณ ที่จ่าย ฿{fmt(r.wht_amount)} </span>}
                    {r.credit_used > 0 && <span>เครดิต ฿{fmt(r.credit_used)}</span>}
                  </p>
                )}
              </div>
              <span className={r.amount_received > 0 ? 'font-medium text-green-600' : 'text-gray-300'}>{r.amount_received > 0 ? `฿${fmt(r.amount_received)}` : '-'}</span>
              <span className={r.diff > 0.01 ? 'text-blue-600 font-medium' : r.diff < -0.01 ? 'text-orange-500 font-medium' : 'text-gray-300'}>
                {Math.abs(r.diff) > 0.01 ? `${r.diff > 0 ? '+' : ''}฿${fmt(r.diff)}` : '-'}
              </span>
              <span><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${payTypeColor[r.pay_type] || 'bg-gray-100 text-gray-500'}`}>{r.pay_type}</span></span>
              <span>{r.has_slip ? <span className="text-green-600 font-medium">📎 {r.slip_count}</span> : <span className="text-gray-300">ไม่มี</span>}</span>
            </div>
          ))}
          {filtered.length > 0 && (
            <div className="grid grid-cols-11 gap-2 px-4 py-3 bg-gray-800 text-xs font-bold text-white rounded-b-xl">
              <div className="col-span-2">รวม {filtered.length} รายการ</div>
              <div className="col-span-2"></div>
              <span></span>
              <span>฿{fmt(summary.totalAmount)}</span>
              <span>฿{fmt(summary.netExpectedTotal)}</span>
              <span className="text-green-400">฿{fmt(summary.totalReceived)}</span>
              <span className={(summary.totalReceived - summary.netExpectedTotal) > 0.01 ? 'text-blue-400' : (summary.totalReceived - summary.netExpectedTotal) < -0.01 ? 'text-orange-400' : 'text-gray-400'}>
                {Math.abs(summary.totalReceived - summary.netExpectedTotal) > 0.01 ? `${(summary.totalReceived - summary.netExpectedTotal) > 0 ? '+' : ''}฿${fmt(summary.totalReceived - summary.netExpectedTotal)}` : '-'}
              </span>
              <span></span>
              <span className="text-green-400">{summary.hasSlip}/{filtered.length}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}