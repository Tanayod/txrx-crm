'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconAlertTriangle, IconClock, IconPhone } from '@tabler/icons-react'

const DUE_TYPE_LABELS: any = {
  standard_3: 'มาตรฐาน (3 วัน)',
  vip_30: 'VIP (30 วัน)',
  fifth_next_month: 'วันที่ 5 เดือนถัดไป',
}

// คำนวณวันครบกำหนดชำระตาม due_type ของลูกค้า
function getDueDate(bookingDate: string, dueType: string) {
  const d = new Date(bookingDate)
  if (dueType === 'vip_30') {
    d.setDate(d.getDate() + 30)
    return d
  }
  if (dueType === 'fifth_next_month') {
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 5)
    return nextMonth
  }
  // standard_3 (default)
  d.setDate(d.getDate() + 3)
  return d
}

export default function Notifications() {
  const { user, role, ready, logout } = useAuth('/notifications')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [debtCases, setDebtCases] = useState<any[]>([])
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false)

  if (ready && !loaded) { fetchDebtCases(); setLoaded(true) }

  async function fetchDebtCases() {
    setLoading(true)
    const today = new Date(); today.setHours(0,0,0,0)

    let allBookings: any[] = []
    let from = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('bookings')
        .select('case_number, booking_date, customers(id, customer_name, phone, type, due_type), payments(amount_received, total_amount, payment_status)')
        .range(from, from + 999)
      if (!chunk || chunk.length === 0) break
      allBookings = [...allBookings, ...chunk]
      if (chunk.length < 1000) break
      from += 1000
    }

    const cases = allBookings
      .map((b: any) => {
        const p = Array.isArray(b.payments) ? b.payments?.[0] : b.payments
        const cust = b.customers
        const status = p?.payment_status
        const isUnpaidStatus = status === 'ยังไม่ชำระ' || status === 'ค้างชำระ' || status === 'เครดิต'
        const outstanding = isUnpaidStatus ? Math.max((p?.total_amount || 0) - (p?.amount_received || 0), 0) : 0
        if (outstanding <= 0 || !cust) return null
        const dueType = cust.due_type || 'standard_3'
        const dueDate = getDueDate(b.booking_date, dueType)
        const daysOver = Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
        return {
          case_number: b.case_number,
          booking_date: b.booking_date,
          customer_id: cust.id,
          customer_name: cust.customer_name,
          phone: cust.phone,
          customer_type: cust.type,
          due_type: dueType,
          due_date: dueDate.toISOString().slice(0,10),
          outstanding,
          daysOver,
          isOverdue: daysOver > 0,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.daysOver - a.daysOver)

    setDebtCases(cases as any[])
    setLoading(false)
  }

  const filtered = filterOverdueOnly ? debtCases.filter(c => c.isOverdue) : debtCases
  const totalOutstanding = filtered.reduce((s, c) => s + c.outstanding, 0)
  const overdueCount = debtCases.filter(c => c.isOverdue).length

  // จัดกลุ่มตามลูกค้า สำหรับสรุปยอดรวมต่อคน
  const byCustomer: any = {}
  filtered.forEach(c => {
    if (!byCustomer[c.customer_name]) byCustomer[c.customer_name] = { name: c.customer_name, phone: c.phone, type: c.customer_type, total: 0, maxDaysOver: 0, cases: [] }
    byCustomer[c.customer_name].total += c.outstanding
    byCustomer[c.customer_name].maxDaysOver = Math.max(byCustomer[c.customer_name].maxDaysOver, c.daysOver)
    byCustomer[c.customer_name].cases.push(c)
  })
  const customerList = Object.values(byCustomer).sort((a: any, b: any) => b.maxDaysOver - a.maxDaysOver)

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/notifications" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">แจ้งเตือน</p>
            <p className="text-xs text-gray-400 mt-0.5">ติดตามลูกหนี้ค้างชำระและเคสที่เกินกำหนด</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filterOverdueOnly} onChange={(e) => setFilterOverdueOnly(e.target.checked)}
              className="rounded border-gray-300" />
            แสดงเฉพาะที่เกินกำหนด
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ยอดค้างรวม</p>
            <p className="text-3xl font-bold text-red-500">{loading ? '—' : `฿${totalOutstanding.toLocaleString()}`}</p>
          </div>
          <div className="bg-white border-l-4 border-l-red-500 border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">เกินกำหนดชำระ</p>
            <p className="text-3xl font-bold text-red-500">{loading ? '—' : overdueCount}</p>
            <p className="text-xs text-gray-400 mt-1">เคส</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">ลูกหนี้ทั้งหมด</p>
            <p className="text-3xl font-bold text-gray-800">{loading ? '—' : customerList.length}</p>
            <p className="text-xs text-gray-400 mt-1">ราย</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span className="col-span-2">ลูกค้า</span><span>เงื่อนไข</span>
            <span>ยอดค้างรวม</span><span>จำนวนเคส</span><span>เกินกำหนด</span><span></span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
          ) : customerList.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              <p className="text-2xl mb-1">✅</p>
              ไม่มีลูกหนี้ค้างชำระ
            </div>
          ) : (
            customerList.map((c: any, i) => (
              <div key={i} className="border-b border-gray-50">
                <div className="grid grid-cols-7 gap-2 px-5 py-3 text-sm hover:bg-gray-50 items-center">
                  <div className="col-span-2">
                    <p className="font-medium text-gray-700">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><IconPhone size={10}/>{c.phone}</p>}
                  </div>
                  <span className="text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${c.type === 'vip' ? 'bg-purple-50 text-purple-600' : c.type === 'credit' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                      {DUE_TYPE_LABELS[c.cases[0]?.due_type] || 'มาตรฐาน (3 วัน)'}
                    </span>
                  </span>
                  <span className="font-bold text-red-500">฿{c.total.toLocaleString()}</span>
                  <span className="text-gray-600">{c.cases.length} เคส</span>
                  <span>
                    {c.maxDaysOver > 0 ? (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium">
                        <IconAlertTriangle size={10}/> เกิน {c.maxDaysOver} วัน
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit font-medium">
                        <IconClock size={10}/> ยังไม่เกินกำหนด
                      </span>
                    )}
                  </span>
                  <button onClick={() => window.location.href='/customers'} className="text-xs text-[#185FA5] hover:underline text-right">ดูลูกค้า</button>
                </div>
                <div className="px-5 pb-3 pl-12 space-y-1">
                  {c.cases.map((cs: any, j: number) => (
                    <div key={j} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="text-gray-500 font-mono">{cs.case_number} · {cs.booking_date}</span>
                      <span className="text-gray-400">ครบกำหนด {cs.due_date}</span>
                      <span className="font-medium text-gray-700">฿{cs.outstanding.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}