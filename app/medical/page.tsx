'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconUpload, IconCheck, IconClock, IconAlertTriangle } from '@tabler/icons-react'

export default function Medical() {
  const { user, role, ready, logout } = useAuth('/medical')
  const [cases, setCases] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [certificates, setCertificates] = useState<any[]>([])
  const [form, setForm] = useState({ actual_count: 0, doctor_note: '', exam_date: '' })
  const [loaded, setLoaded] = useState(false)

  if (ready && !loaded) {
    fetchCases()
    setLoaded(true)
  }

  async function fetchCases() {
    const { data } = await supabase
      .from('bookings')
      .select('*, customers(customer_name), medical_cases(*)')
      .order('booking_date', { ascending: false })
    if (data) setCases(data)
  }

  const fetchCertificates = async (caseId: string) => {
    const { data } = await supabase.from('certificates').select('*').eq('case_id', caseId)
    if (data) setCertificates(data)
  }

  const handleOpenModal = async (booking: any) => {
    setSelected(booking)
    const mc = booking.medical_cases?.[0]
    setForm({
      actual_count: mc?.actual_count || 0,
      doctor_note: mc?.doctor_note || '',
      exam_date: mc?.exam_date || booking.booking_date
    })
    if (mc?.id) await fetchCertificates(mc.id)
    else setCertificates([])
    setShowModal(true)
  }

  const handleSaveMedical = async () => {
    const mc = selected?.medical_cases?.[0]
    const deadline = new Date(form.exam_date)
    deadline.setDate(deadline.getDate() + 3)
    const deadlineStr = deadline.toISOString().slice(0, 10)
    if (mc?.id) {
      await supabase.from('medical_cases').update({
        actual_count: form.actual_count,
        doctor_note: form.doctor_note,
        exam_date: form.exam_date,
        cert_deadline: deadlineStr,
      }).eq('id', mc.id)
    } else {
      await supabase.from('medical_cases').insert([{
        booking_id: selected.id,
        actual_count: form.actual_count,
        doctor_note: form.doctor_note,
        exam_date: form.exam_date,
        cert_deadline: deadlineStr,
        cert_status: 'รอส่ง',
      }])
    }
    fetchCases()
    setShowModal(false)
  }

  const handleUploadFile = async (e: any) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const mc = selected?.medical_cases?.[0]
    if (!mc?.id) { alert('กรุณาบันทึกจำนวนตรวจจริงก่อนแนบไฟล์'); setUploading(false); return }
    const fileName = `${mc.id}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('certificates').upload(fileName, file)
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('certificates').getPublicUrl(fileName)
      await supabase.from('certificates').insert([{ case_id: mc.id, file_name: file.name, storage_url: urlData.publicUrl }])
      await supabase.from('medical_cases').update({ cert_status: 'เรียบร้อย' }).eq('id', mc.id)
      fetchCertificates(mc.id)
      fetchCases()
    }
    setUploading(false)
  }

  const getCertStatus = (booking: any) => {
    const mc = booking.medical_cases?.[0]
    if (!mc) return { label: 'รอบันทึก', color: 'bg-gray-100 text-gray-500', icon: IconClock }
    if (mc.cert_status === 'เรียบร้อย') return { label: 'ส่งครบแล้ว', color: 'bg-green-50 text-green-600', icon: IconCheck }
    const deadline = new Date(mc.cert_deadline)
    if (new Date() > deadline) return { label: 'เกิน 3 วัน!', color: 'bg-red-50 text-red-600', icon: IconAlertTriangle }
    return { label: 'รอส่งใบแพทย์', color: 'bg-amber-50 text-amber-600', icon: IconClock }
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/medical" onLogout={logout} />

      <div className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <p className="text-base font-medium text-gray-800">ทีมแพทย์</p>
          <p className="text-xs text-gray-400 mt-0.5">บันทึกจำนวนตรวจจริงและแนบใบรับรองแพทย์</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่ตรวจ</span>
            <span>จอง / จริง</span><span>สถานะใบแพทย์</span><span></span>
          </div>
          {cases.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีรายการ</div>
          ) : (
            cases.map((b) => {
              const status = getCertStatus(b)
              const mc = b.medical_cases?.[0]
              return (
                <div key={b.id} className="grid grid-cols-6 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <span className="font-medium text-gray-700">{b.customers?.customer_name}</span>
                  <span className="text-gray-500">{mc?.exam_date || b.booking_date}</span>
                  <span className="text-gray-700">{b.booked_count?.toLocaleString()} / <span className="text-[#185FA5] font-medium">{mc?.actual_count?.toLocaleString() || '-'}</span></span>
                  <span><span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${status.color}`}><status.icon size={11} />{status.label}</span></span>
                  <button onClick={() => handleOpenModal(b)} className="text-xs text-[#185FA5] hover:underline text-right">บันทึก / แนบไฟล์</button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
            <p className="text-base font-medium text-gray-800 mb-1">{selected.customers?.customer_name}</p>
            <p className="text-xs text-gray-400 mb-4">{selected.case_number}</p>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">วันที่ตรวจจริง</label>
                  <input type="date" value={form.exam_date} onChange={(e) => setForm({...form, exam_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จำนวนตรวจจริง</label>
                  <input type="text" inputMode="numeric" value={form.actual_count || ''}
                    onChange={(e) => setForm({...form, actual_count: Number(e.target.value.replace(/\D/g,''))})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <textarea value={form.doctor_note} onChange={(e) => setForm({...form, doctor_note: e.target.value})} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
            </div>
            <button onClick={handleSaveMedical} className="w-full bg-[#185FA5] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0C447C] mb-4">
              บันทึกจำนวนตรวจจริง
            </button>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">ใบรับรองแพทย์</p>
              {certificates.map((cert) => (
                <div key={cert.id} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg mb-1.5">
                  <IconCheck size={13} className="text-green-600 flex-shrink-0" />
                  <a href={cert.storage_url} target="_blank" className="text-xs text-green-700 hover:underline truncate">{cert.file_name}</a>
                </div>
              ))}
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                <IconUpload size={15} />
                {uploading ? 'กำลังอัพโหลด...' : 'แนบไฟล์ใบรับรองแพทย์'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadFile} className="hidden" disabled={uploading} />
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