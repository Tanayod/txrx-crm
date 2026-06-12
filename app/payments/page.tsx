'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconUpload, IconCheck } from '@tabler/icons-react'

export default function Payments() {
  const { user, role, ready, logout } = useAuth('/payments')
  const [bookings, setBookings] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState({
    amount_received: 0, method: 'transfer',
    payment_status: 'ชำระเงินแล้ว', invoice_no: '',
  })

  if (ready && !loaded) { fetchBookings(); setLoaded(true) }

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(customer_name, type, credit_limit, credit_balance), payments(*)')
      .order('booking_date', { ascending: false })
    if (data) setBookings(data)
  }

  const handleOpenModal = (booking: any) => {
    setSelected(booking)
    const p = booking.payments?.[0]
    setForm({
      amount_received: p?.amount_received || 0,
      method: p?.method || 'transfer',
      payment_status: p?.payment_status || 'ยังไม่ชำระ',
      invoice_no: p?.invoice_no || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    const p = selected?.payments?.[0]
    if (p?.id) {
      await supabase.from('payments').update({
        amount_received: form.amount_received,
        method: form.method,
        payment_status: form.payment_status,
        invoice_no: form.invoice_no,
        paid_at: form.payment_status === 'ชำระเงินแล้ว' ? new Date().toISOString() : null,
      }).eq('id', p.id)
    } else {
      await supabase.from('payments').insert([{
        booking_id: selected.id,
        customer_id: selected.customer_id,
        amount_received: form.amount_received,
        method: form.method,
        payment_status: form.payment_status,
        invoice_no: form.invoice_no,
        paid_at: form.payment_status === 'ชำระเงินแล้ว' ? new Date().toISOString() : null,
      }])
    }
    if (selected.customers?.type === 'credit' && form.payment_status === 'เครดิต') {
      await supabase.from('customers').update({
        credit_balance: (selected.customers.credit_balance || 0) + form.amount_received
      }).eq('id', selected.customer_id)
    }
    fetchBookings()
    setShowModal(false)
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
      if (p?.id) {
        await supabase.from('payments').update({ slip_url: urlData.publicUrl, is_verified: true }).eq('id', p.id)
      }
      fetchBookings()
    }
    setUploading(false)
  }

  const getPaymentStatus = (booking: any) => {
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
      <Sidebar user={user} role={role} currentPath="/payments" onLogout={logout} />

      <div className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <p className="text-base font-medium text-gray-800">การเงิน</p>
          <p className="text-xs text-gray-400 mt-0.5">สถานะการชำระเงินทั้งหมด</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่</span>
            <span>ยอดรับ</span><span>สถานะ</span><span></span>
          </div>
          {bookings.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีรายการ</div>
          ) : (
            bookings.map((b) => {
              const status = getPaymentStatus(b)
              const p = b.payments?.[0]
              return (
                <div key={b.id} className="grid grid-cols-6 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <div>
                    <p className="font-medium text-gray-700">{b.customers?.customer_name}</p>
                    {b.customers?.type === 'credit' && <p className="text-xs text-amber-500">เครดิต</p>}
                  </div>
                  <span className="text-gray-500">{b.booking_date}</span>
                  <div>
                    <p className="text-gray-700">{p?.amount_received ? `฿${p.amount_received.toLocaleString()}` : '-'}</p>
                    {p?.is_verified && <p className="text-xs text-green-500 flex items-center gap-1"><IconCheck size={11} />แนบสลิปแล้ว</p>}
                  </div>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span></span>
                  <button onClick={() => handleOpenModal(b)} className="text-xs text-[#185FA5] hover:underline text-right">บันทึก / แนบสลิป</button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg">
            <p className="text-base font-medium text-gray-800 mb-1">{selected.customers?.customer_name}</p>
            <p className="text-xs text-gray-400 mb-4">{selected.case_number}</p>

            {selected.customers?.type === 'credit' && (
              <div className="bg-amber-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-700 font-medium">ลูกค้าเครดิต</p>
                <p className="text-xs text-amber-600 mt-0.5">วงเงิน: ฿{selected.customers.credit_limit?.toLocaleString()} | ค้างอยู่: ฿{selected.customers.credit_balance?.toLocaleString()}</p>
              </div>
            )}

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ยอดรับชำระ (บาท)</label>
                <input type="text" inputMode="numeric" value={form.amount_received || ''}
                  onChange={(e) => setForm({...form, amount_received: Number(e.target.value.replace(/\D/g,''))})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">วิธีชำระ</label>
                <select value={form.method} onChange={(e) => setForm({...form, method: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="transfer">โอนเงิน</option>
                  <option value="cash">เงินสด</option>
                  <option value="credit">เครดิต</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">สถานะ</label>
                <select value={form.payment_status} onChange={(e) => setForm({...form, payment_status: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option>ชำระเงินแล้ว</option>
                  <option>ยังไม่ชำระ</option>
                  <option>ค้างชำระ</option>
                  <option>เครดิต</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">เลขที่ใบวางบิล</label>
                <input value={form.invoice_no} onChange={(e) => setForm({...form, invoice_no: e.target.value})}
                  placeholder="INV-XXXX"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
            </div>

            <button onClick={handleSave} className="w-full bg-[#185FA5] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0C447C] mb-4">
              บันทึกการชำระเงิน
            </button>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">แนบสลิป</p>
              {selected.payments?.[0]?.slip_url && (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg mb-2">
                  <IconCheck size={13} className="text-green-600" />
                  <a href={selected.payments[0].slip_url} target="_blank" className="text-xs text-green-700 hover:underline">ดูสลิป</a>
                </div>
              )}
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                <IconUpload size={15} />
                {uploading ? 'กำลังอัพโหลด...' : 'แนบไฟล์สลิป'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadSlip} className="hidden" disabled={uploading} />
              </label>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}