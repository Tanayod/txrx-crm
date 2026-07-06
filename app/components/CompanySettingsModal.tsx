'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { IconX } from '@tabler/icons-react'

export default function CompanySettingsModal({ settings, onClose, onSaved }: { settings: any, onClose: () => void, onSaved: (s: any) => void }) {
  const [form, setForm] = useState({
    id: settings?.id,
    company_name: settings?.company_name || '',
    address: settings?.address || '',
    tax_id: settings?.tax_id || '',
    branch: settings?.branch || 'สำนักงานใหญ่',
    contact_name: settings?.contact_name || '',
    phone: settings?.phone || '',
    email: settings?.email || '',
    website: settings?.website || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    let result
    if (form.id) {
      result = await supabase.from('company_settings').update(payload).eq('id', form.id).select().single()
    } else {
      result = await supabase.from('company_settings').insert([payload]).select().single()
    }
    setSaving(false)
    if (result.data) { onSaved(result.data); onClose() }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <p className="text-base font-semibold text-gray-800">ตั้งค่าข้อมูลบริษัท (ใช้ในใบเสร็จ)</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={20}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">ชื่อบริษัท</label>
            <input value={form.company_name} onChange={(e) => setForm({...form, company_name: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">ที่อยู่</label>
            <textarea value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">เลขประจำตัวผู้เสียภาษี</label>
              <input value={form.tax_id} onChange={(e) => setForm({...form, tax_id: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">สาขา</label>
              <input value={form.branch} onChange={(e) => setForm({...form, branch: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">โทรศัพท์</label>
              <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">อีเมล</label>
              <input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">เว็บไซต์</label>
            <input value={form.website} onChange={(e) => setForm({...form, website: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">ผู้ติดต่อเริ่มต้น (แสดงในช่อง "ติดต่อกลับที่" ของใบเสร็จ ปรับต่อใบได้ตอนออกใบเสร็จ)</p>
            <label className="text-xs font-medium text-gray-600 mb-1 block">ชื่อผู้ติดต่อ</label>
            <input value={form.contact_name} onChange={(e) => setForm({...form, contact_name: e.target.value})}
              placeholder="เช่น Thidarat Maikeaw"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            <p className="text-xs text-gray-400 mt-1">เบอร์โทร/อีเมลด้านบนจะถูกใช้เป็นข้อมูลติดต่อของคนนี้ในใบเสร็จ</p>
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50 font-medium">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}