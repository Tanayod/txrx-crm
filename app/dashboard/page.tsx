'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'

export default function Dashboard() {
  const { user, role, ready, logout } = useAuth('/dashboard')
  const [stats, setStats] = useState({ todayBookings: 0, pendingPayments: 0, overdueCerts: 0, monthlyRevenue: 0 })
  const [recentBookings, setRecentBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  if (ready && !loaded) { fetchData(); setLoaded(true) }

  async function fetchData() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

    const { data: todayData } = await supabase.from('bookings').select('id').eq('booking_date', today)
    const { data: pendingData } = await supabase.from('payments').select('id').in('payment_status', ['ยังไม่ชำระ', 'ค้างชำระ'])
    const { data: overdueData } = await supabase.from('medical_cases').select('id').eq('cert_status', 'รอส่ง').lt('cert_deadline', today)
    const { data: revenueData } = await supabase.from('payments').select('amount_received').eq('payment_status', 'ชำระเงินแล้ว').gte('paid_at', firstOfMonth)
    const monthlyRevenue = revenueData?.reduce((sum, p) => sum + (p.amount_received || 0), 0) || 0

    setStats({
      todayBookings: todayData?.length || 0,
      pendingPayments: pendingData?.length || 0,
      overdueCerts: overdueData?.length || 0,
      monthlyRevenue,
    })

    const { data: recent } = await supabase
      .from('bookings')
      .select('*, customers(customer_name), medical_cases(*), payments(*)')
      .order('created_at', { ascending: false })
      .limit(5)
    if (recent) setRecentBookings(recent)
    setLoading(false)
  }

  const getCertBadge = (booking: any) => {
    const mc = booking.medical_cases?.[0]
    if (!mc) return { label: 'รอบันทึก', color: 'bg-gray-100 text-gray-500' }
    if (mc.cert_status === 'เรียบร้อย') return { label: 'ส่งครบแล้ว', color: 'bg-green-50 text-green-600' }
    const deadline = new Date(mc.cert_deadline)
    if (new Date() > deadline) return { label: 'เกิน 3 วัน!', color: 'bg-red-50 text-red-600' }
    return { label: 'รอส่งใบแพทย์', color: 'bg-amber-50 text-amber-600' }
  }

  const getPaymentBadge = (booking: any) => {
    const p = booking.payments?.[0]
    if (!p) return { label: 'ยังไม่ชำระ', color: 'bg-gray-100 text-gray-500' }
    const map: any = {
      'ชำระเงินแล้ว': 'bg-green-50 text-green-600',
      'ยังไม่ชำระ': 'bg-gray-100 text-gray-500',
      'ค้างชำระ': 'bg-red-50 text-red-600',
      'เครดิต': 'bg-amber-50 text-amber-600',
    }
    return { label: p.payment_status, color: map[p.payment_status] || 'bg-gray-100 text-gray-500' }
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/dashboard" onLogout={logout} />

      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">Dashboard</p>
            <p className="text-xs text-gray-400 mt-0.5">ภาพรวมระบบทั้งหมด</p>
          </div>
          {role === 'admin' && (
            <button onClick={() => window.location.href = '/bookings'}
              className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C]">
              + จองคิวใหม่
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-[#185FA5]" onClick={() => window.location.href = '/bookings'}>
            <p className="text-xs text-gray-400 mb-1">จองวันนี้</p>
            <p className="text-2xl font-medium text-gray-800">{loading ? '-' : stats.todayBookings}</p>
            <p className="text-xs text-gray-400 mt-1">รายการ</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-red-300" onClick={() => window.location.href = '/payments'}>
            <p className="text-xs text-gray-400 mb-1">ค้างชำระ</p>
            <p className="text-2xl font-medium text-red-500">{loading ? '-' : stats.pendingPayments}</p>
            <p className="text-xs text-gray-400 mt-1">รายการ</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-amber-300" onClick={() => window.location.href = '/medical'}>
            <p className="text-xs text-gray-400 mb-1">ค้างใบแพทย์</p>
            <p className="text-2xl font-medium text-amber-500">{loading ? '-' : stats.overdueCerts}</p>
            <p className="text-xs text-gray-400 mt-1">เกิน 3 วัน</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-green-300" onClick={() => window.location.href = '/payments'}>
            <p className="text-xs text-gray-400 mb-1">รับเงินเดือนนี้</p>
            <p className="text-2xl font-medium text-green-600">{loading ? '-' : `฿${stats.monthlyRevenue.toLocaleString()}`}</p>
            <p className="text-xs text-gray-400 mt-1">บาท</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
            <p className="text-sm font-medium text-gray-700">รายการจองล่าสุด</p>
            <span onClick={() => window.location.href = '/bookings'} className="text-xs text-[#185FA5] cursor-pointer hover:underline">ดูทั้งหมด →</span>
          </div>
          <div className="grid grid-cols-5 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>ลูกค้า / สถานที่</span><span>วันที่</span><span>จอง / จริง</span><span>ใบแพทย์</span><span>ชำระเงิน</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
          ) : recentBookings.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีรายการจอง</div>
          ) : (
            recentBookings.map((b) => {
              const cert = getCertBadge(b)
              const pay = getPaymentBadge(b)
              const mc = b.medical_cases?.[0]
              return (
                <div key={b.id} className="grid grid-cols-5 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <div>
                    <p className="font-medium text-gray-700 text-sm">{b.customers?.customer_name}</p>
                    <p className="text-xs text-gray-400">{b.location_name || b.province || '-'}</p>
                  </div>
                  <span className="text-gray-500 text-xs">{b.booking_date}</span>
                  <span className="text-gray-700 text-xs">{b.booked_count?.toLocaleString()} / <span className="text-[#185FA5] font-medium">{mc?.actual_count?.toLocaleString() || '-'}</span></span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full ${cert.color}`}>{cert.label}</span></span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full ${pay.color}`}>{pay.label}</span></span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}