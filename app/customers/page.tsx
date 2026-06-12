'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch } from '@tabler/icons-react'

export default function Customers() {
  const { user, role, ready, logout } = useAuth('/customers')
  const [customers, setCustomers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState({
    line_name: '', customer_name: '', phone: '',
    type: 'general', credit_limit: 0, note: ''
  })

  if (ready && !loaded) {
    fetchCustomers()
    setLoaded(true)
  }

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (data) setCustomers(data)
  }

  const handleSave = async () => {
    const { error } = await supabase.from('customers').insert([form])
    if (!error) {
      fetchCustomers()
      setShowModal(false)
      setForm({ line_name: '', customer_name: '', phone: '', type: 'general', credit_limit: 0, note: '' })
    }
  }

  const filtered = customers.filter(c =>
    c.customer_name?.includes(search) || c.line_name?.includes(search)
  )

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
          <button onClick={() => setShowModal(true)} className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2">
            <IconPlus size={16} /> เพิ่มลูกค้า
          </button>
        </div>

        <div className="relative mb-4">
          <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="ค้นหาชื่อลูกค้า หรือชื่อ LINE..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] bg-white" />
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>รหัส</span><span>ชื่อลูกค้า</span><span>ชื่อ LINE</span>
            <span>เบอร์โทร</span><span>ประเภท</span><span>หมายเหตุ</span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีข้อมูลลูกค้า</div>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="grid grid-cols-6 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50">
                <span className="text-gray-400 text-xs">CUS-{String(c.customer_code).padStart(3,'0')}</span>
                <span className="font-medium text-gray-700">{c.customer_name}</span>
                <span className="text-gray-500">{c.line_name || '-'}</span>
                <span className="text-gray-500">{c.phone || '-'}</span>
                <span><span className={`text-xs px-2 py-0.5 rounded-full ${c.type === 'credit' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                  {c.type === 'credit' ? 'เครดิต' : 'ทั่วไป'}
                </span></span>
                <span className="text-gray-400 text-xs">{c.note || '-'}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg">
            <p className="text-base font-medium text-gray-800 mb-4">เพิ่มลูกค้าใหม่</p>
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
                  <option value="credit">เครดิต</option>
                </select>
              </div>
              {form.type === 'credit' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">วงเงินเครดิต</label>
                  <input type="number" value={form.credit_limit} onChange={(e) => setForm({...form, credit_limit: Number(e.target.value)})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
              )}
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
    </div>
  )
}