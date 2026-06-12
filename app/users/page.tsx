export const dynamic = 'force-dynamic'
'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconPlus, IconSearch, IconEdit } from '@tabler/icons-react'

export default function Users() {
  const { user, role, ready, logout } = useAuth('/users')
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    email: '', password: '', display_name: '', role: 'admin'
  })

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setUsers(data)
  }, [])

  if (ready && !loaded) {
    fetchUsers()
    setLoaded(true)
  }

 const handleOpenAdd = () => {
  console.log('clicked add')
  setEditing(null)
  setForm({ email: '', password: '', display_name: '', role: 'admin' })
  setShowModal(true)
}

  const handleOpenEdit = (u: any) => {
    setEditing(u)
    setForm({ email: '', password: '', display_name: u.display_name || '', role: u.role })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!editing && (!form.email || !form.password)) {
      alert('กรุณากรอกอีเมลและรหัสผ่าน')
      return
    }
    setSaving(true)

    if (editing) {
      await supabase.from('users').update({
        display_name: form.display_name,
        role: form.role,
      }).eq('id', editing.id)
      await fetchUsers()
      setShowModal(false)
    } else {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          display_name: form.display_name,
          role: form.role
        })
      })
      const result = await res.json()
      if (!res.ok) {
        alert(result.error || 'เกิดข้อผิดพลาด')
      } else {
        await fetchUsers()
        setShowModal(false)
      }
    }
    setSaving(false)
  }

  const handleToggleActive = async (u: any) => {
    await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    await fetchUsers()
  }

  const filtered = users.filter(u =>
    u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.id?.includes(search)
  )

  const roleLabel: any = { admin: 'Admin', doctor: 'ทีมแพทย์', finance: 'บัญชี' }
  const roleColor: any = {
    admin: 'bg-blue-50 text-blue-600',
    doctor: 'bg-green-50 text-green-600',
    finance: 'bg-amber-50 text-amber-600',
  }

  if (!ready) return (
    <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">
      กำลังโหลด...
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/users" onLogout={logout} />

      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">จัดการ User</p>
            <p className="text-xs text-gray-400 mt-0.5">เพิ่ม แก้ไข และกำหนดสิทธิ์ผู้ใช้งาน</p>
          </div>
          <button onClick={handleOpenAdd}
            className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] flex items-center gap-2">
            <IconPlus size={16} /> เพิ่ม User
          </button>
        </div>

        <div className="relative mb-4">
          <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="ค้นหาชื่อ..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] bg-white" />
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span className="col-span-2">ชื่อ / อีเมล</span>
            <span>Role</span>
            <span>สถานะ</span>
            <span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีข้อมูล</div>
          ) : (
            filtered.map((u) => (
              <div key={u.id} className="grid grid-cols-5 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                <div className="col-span-2 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#E6F1FB] flex items-center justify-center text-xs font-medium text-[#185FA5] flex-shrink-0">
                    {(u.display_name || u.id)?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">{u.display_name || '-'}</p>
                    <p className="text-xs text-gray-400">{u.id?.slice(0, 8)}...</p>
                  </div>
                </div>
                <span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleColor[u.role] || 'bg-gray-100 text-gray-500'}`}>
                    {roleLabel[u.role] || u.role}
                  </span>
                </span>
                <span>
                  <button onClick={() => handleToggleActive(u)}
                    className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {u.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                  </button>
                </span>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => handleOpenEdit(u)} className="text-gray-400 hover:text-[#185FA5]">
                    <IconEdit size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg">
            <p className="text-base font-medium text-gray-800 mb-4">
              {editing ? 'แก้ไข User' : 'เพิ่ม User ใหม่'}
            </p>
            <div className="space-y-3">
              {!editing && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">อีเมล *</label>
                    <input type="email" value={form.email}
                      onChange={(e) => setForm({...form, email: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">รหัสผ่าน *</label>
                    <input type="password" value={form.password}
                      onChange={(e) => setForm({...form, password: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ชื่อที่แสดง</label>
                <input value={form.display_name}
                  onChange={(e) => setForm({...form, display_name: e.target.value})}
                  placeholder="เช่น นพ.สมชาย / คุณสมหญิง"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Role / สิทธิ์</label>
                <select value={form.role}
                  onChange={(e) => setForm({...form, role: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                  <option value="admin">Admin — เห็นทุกหน้า</option>
                  <option value="doctor">ทีมแพทย์ — เห็นเฉพาะหน้าแพทย์</option>
                  <option value="finance">บัญชี — เห็นการเงินและใบวางบิล</option>
                </select>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 font-medium mb-1">สิทธิ์แต่ละ Role</p>
                <p className="text-xs text-blue-500">Admin — ทุกหน้า</p>
                <p className="text-xs text-blue-500">ทีมแพทย์ — หน้าทีมแพทย์เท่านั้น</p>
                <p className="text-xs text-blue-500">บัญชี — Dashboard, การเงิน, ใบวางบิล</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}