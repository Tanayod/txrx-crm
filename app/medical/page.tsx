'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconUpload, IconCheck, IconClock, IconAlertTriangle, IconSearch, IconDownload, IconLink } from '@tabler/icons-react'

export default function Medical() {
  const { user, role, ready, logout } = useAuth('/medical')
  const [cases, setCases] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [certificates, setCertificates] = useState<any[]>([])
  const [form, setForm] = useState({ actual_count: 0, cert_count: 0, doctor_note: '', exam_date: '', parcel_sent: false })
  const [loaded, setLoaded] = useState(false)

  // สำหรับแนบลิงก์ (เช่น Google Drive, Dropbox) แทนการอัปโหลดไฟล์ตรง — เลี่ยงปัญหาไฟล์ใหญ่เกินลิมิต
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [savingLink, setSavingLink] = useState(false)

  const getDefaultFrom = () => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) }
  const [search, setSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(getDefaultFrom())
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterBookedMin, setFilterBookedMin] = useState('')
  const [filterBookedMax, setFilterBookedMax] = useState('')
  const [filterActualMin, setFilterActualMin] = useState('')
  const [filterActualMax, setFilterActualMax] = useState('')
  const [filterHasActual, setFilterHasActual] = useState('')

  if (ready && !loaded) { fetchCases(); setLoaded(true) }

  async function fetchCases(dateFrom?: string, dateTo?: string) {
    let all: any[] = []
    let from = 0
    const df = dateFrom ?? filterDateFrom
    const dt = dateTo ?? filterDateTo
    while (true) {
      let q = supabase.from('bookings').select('*, customers(customer_name), medical_cases(*)')
        .order('booking_date', { ascending: false })
      if (df) q = q.gte('booking_date', df)
      if (dt) q = q.lte('booking_date', dt)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < 1000) break
      from += 1000
    }
    setCases(all)
  }

  const fetchCertificates = async (caseId: string) => {
    const { data } = await supabase.from('certificates').select('*').eq('case_id', caseId)
    if (data) setCertificates(data)
  }

  const handleOpenModal = async (booking: any) => {
    setSelected(booking)
    const mc = Array.isArray(booking.medical_cases) ? booking.medical_cases?.[0] : booking.medical_cases
    setForm({ actual_count: mc?.actual_count || 0, cert_count: mc?.cert_count || 0, doctor_note: mc?.doctor_note || '', exam_date: mc?.exam_date || booking.booking_date, parcel_sent: mc?.parcel_sent || false })
    if (mc?.id) await fetchCertificates(mc.id)
    else setCertificates([])
    setLinkUrl(''); setLinkName('')
    setShowModal(true)
  }

  const handleSaveMedical = async () => {
    const mc = Array.isArray(selected?.medical_cases) ? selected?.medical_cases?.[0] : selected?.medical_cases
    const deadline = new Date(form.exam_date)
    deadline.setDate(deadline.getDate() + 3)
    const deadlineStr = deadline.toISOString().slice(0, 10)
    if (mc?.id) {
      await supabase.from('medical_cases').update({ actual_count: form.actual_count, cert_count: form.cert_count, doctor_note: form.doctor_note, exam_date: form.exam_date, cert_deadline: deadlineStr, parcel_sent: form.parcel_sent }).eq('id', mc.id)
    } else {
      await supabase.from('medical_cases').insert([{ booking_id: selected.id, actual_count: form.actual_count, cert_count: form.cert_count, doctor_note: form.doctor_note, exam_date: form.exam_date, cert_deadline: deadlineStr, cert_status: 'รอส่ง', parcel_sent: form.parcel_sent }])
    }
    fetchCases(); setShowModal(false)
  }

  // อัปโหลดไฟล์ผ่าน API กลาง (/api/upload) ซึ่งจะส่งไฟล์ต่อไปเก็บที่ Google Cloud Storage
  const uploadFileToGCS = async (file: File, folder: string): Promise<{ url: string, fileName: string } | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('อัปโหลดไม่สำเร็จ:', err)
        return null
      }
      return await res.json()
    } catch (err) {
      console.error('อัปโหลดไม่สำเร็จ:', err)
      return null
    }
  }

  const handleUploadFile = async (e: any) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const mc = Array.isArray(selected?.medical_cases) ? selected?.medical_cases?.[0] : selected?.medical_cases
    if (!mc?.id) { alert('กรุณาบันทึกจำนวนตรวจจริงก่อนแนบไฟล์'); setUploading(false); return }
    const uploaded = await uploadFileToGCS(file, 'certificates')
    if (uploaded) {
      await supabase.from('certificates').insert([{ case_id: mc.id, file_name: uploaded.fileName, storage_url: uploaded.url }])
      await supabase.from('medical_cases').update({ cert_status: 'เรียบร้อย' }).eq('id', mc.id)
      fetchCertificates(mc.id); fetchCases()
    } else {
      alert('อัปโหลดไม่สำเร็จ กรุณาลองใหม่')
    }
    setUploading(false)
  }

  // แนบลิงก์ URL แทนการอัปโหลดไฟล์โดยตรง (เช่น ลิงก์ Google Drive ที่แชร์ไว้แล้ว) — ไม่มีข้อจำกัดเรื่องขนาดไฟล์เลย
  const handleAddLink = async () => {
    if (!linkUrl.trim()) return
    // เช็คคร่าวๆ ว่าเป็น URL ที่ใช้ได้
    try { new URL(linkUrl.trim()) } catch { alert('ลิงก์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง (ต้องขึ้นต้นด้วย http:// หรือ https://)'); return }

    setSavingLink(true)
    const mc = Array.isArray(selected?.medical_cases) ? selected?.medical_cases?.[0] : selected?.medical_cases
    if (!mc?.id) { alert('กรุณาบันทึกจำนวนตรวจจริงก่อนแนบลิงก์'); setSavingLink(false); return }

    const { error } = await supabase.from('certificates').insert([{
      case_id: mc.id,
      file_name: linkName.trim() || 'ลิงก์ไฟล์แนบ',
      storage_url: linkUrl.trim(),
    }])
    if (!error) {
      await supabase.from('medical_cases').update({ cert_status: 'เรียบร้อย' }).eq('id', mc.id)
      fetchCertificates(mc.id); fetchCases()
      setLinkUrl(''); setLinkName('')
    } else {
      alert(`บันทึกลิงก์ไม่สำเร็จ: ${error.message}`)
    }
    setSavingLink(false)
  }

  const handleDeleteCertificate = async (certId: string) => {
    const mc = Array.isArray(selected?.medical_cases) ? selected?.medical_cases?.[0] : selected?.medical_cases
    await supabase.from('certificates').delete().eq('id', certId)
    if (mc?.id) fetchCertificates(mc.id)
  }

  const getCertStatus = (booking: any) => {
    const mc = Array.isArray(booking.medical_cases) ? booking.medical_cases?.[0] : booking.medical_cases
    if (!mc) return { label: 'รอบันทึก', color: 'bg-gray-100 text-gray-500', icon: IconClock }
    if (mc.cert_status === 'เรียบร้อย') return { label: 'ส่งครบแล้ว', color: 'bg-green-50 text-green-600', icon: IconCheck }
    const deadline = new Date(mc.cert_deadline)
    if (new Date() > deadline) return { label: 'เกิน 3 วัน!', color: 'bg-red-50 text-red-600', icon: IconAlertTriangle }
    return { label: 'รอส่งใบแพทย์', color: 'bg-amber-50 text-amber-600', icon: IconClock }
  }

  // เปลี่ยนสถานะใบแพทย์ตรงจากแถว — ถ้ายังไม่มี medical_cases เลย จะสร้างแถวใหม่ให้
  const handleQuickCertStatus = async (b: any, newStatus: string) => {
    const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
    if (mc?.id) {
      await supabase.from('medical_cases').update({ cert_status: newStatus }).eq('id', mc.id)
    } else {
      const deadline = new Date(b.booking_date)
      deadline.setDate(deadline.getDate() + 3)
      await supabase.from('medical_cases').insert([{
        booking_id: b.id, actual_count: 0, cert_count: 0,
        exam_date: b.booking_date, cert_deadline: deadline.toISOString().slice(0,10),
        cert_status: newStatus,
      }])
    }
    fetchCases()
  }

  const filtered = cases.filter(b => {
    const mc = (Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)
    const status = getCertStatus(b)
    const date = mc?.exam_date || b.booking_date
    if (search && !b.customers?.customer_name?.includes(search) && !b.case_number?.includes(search)) return false
    if (filterDateFrom && date < filterDateFrom) return false
    if (filterDateTo && date > filterDateTo) return false
    if (filterStatus && status.label !== filterStatus) return false
    if (filterBookedMin && b.booked_count < Number(filterBookedMin)) return false
    if (filterBookedMax && b.booked_count > Number(filterBookedMax)) return false
    if (filterActualMin && (mc?.actual_count ?? -1) < Number(filterActualMin)) return false
    if (filterActualMax && (mc?.actual_count ?? 99999) > Number(filterActualMax)) return false
    if (filterHasActual === 'มี' && !(mc?.actual_count > 0)) return false
    if (filterHasActual === 'ไม่มี' && mc?.actual_count > 0) return false
    return true
  })

  const exportExcel = () => {
    const rows = filtered.map(b => {
      const mc = (Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)
      const status = getCertStatus(b)
      return {
        'เลขจอง': b.case_number,
        'ลูกค้า': b.customers?.customer_name,
        'วันที่ตรวจ': mc?.exam_date || b.booking_date,
        'จำนวนจอง': b.booked_count,
        'จำนวนตรวจจริง': mc?.actual_count || '-',
        'สถานะใบแพทย์': status.label,
        'หมายเหตุ': mc?.doctor_note || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Medical')
    XLSX.writeFile(wb, `medical_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const clearFilters = () => {
    const df = getDefaultFrom()
    setSearch(''); setFilterDateFrom(df); setFilterDateTo(''); setFilterStatus('')
    setFilterBookedMin(''); setFilterBookedMax('')
    setFilterActualMin(''); setFilterActualMax(''); setFilterHasActual('')
    fetchCases(df, '')
  }

  if (!ready) return <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar user={user} role={role} currentPath="/medical" onLogout={logout} />
      <div className="flex-1 ml-56 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-base font-medium text-gray-800">ทีมแพทย์</p>
            <p className="text-xs text-gray-400 mt-0.5">บันทึกจำนวนตรวจจริงและแนบใบรับรองแพทย์</p>
          </div>
          <button onClick={exportExcel} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <IconDownload size={15} /> Export Excel
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="ค้นหาลูกค้า หรือเลขจอง..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchCases()}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <button onClick={() => fetchCases()}
              className="bg-[#185FA5] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#0C447C] transition-colors flex-shrink-0">
              ค้นหา
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานะใบแพทย์</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option>รอบันทึก</option>
                <option>รอส่งใบแพทย์</option>
                <option>เกิน 3 วัน!</option>
                <option>ส่งครบแล้ว</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-50">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (min)</label>
              <input type="number" value={filterBookedMin} onChange={(e) => setFilterBookedMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (max)</label>
              <input type="number" value={filterBookedMax} onChange={(e) => setFilterBookedMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนตรวจจริง</label>
              <select value={filterHasActual} onChange={(e) => setFilterHasActual(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                <option value="">ทั้งหมด</option>
                <option value="มี">มีแล้ว</option>
                <option value="ไม่มี">ยังไม่มี</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (min)</label>
              <input type="number" value={filterActualMin} onChange={(e) => setFilterActualMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (max)</label>
              <input type="number" value={filterActualMax} onChange={(e) => setFilterActualMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
            </div>
          </div>
          <div className="flex justify-between items-center pt-1">
            <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
            <button onClick={clearFilters} className="text-xs text-[#185FA5] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
            <span>เลขจอง</span><span>ลูกค้า</span><span>วันที่ตรวจ</span>
            <span>สถานที่</span><span>จอง / จริง</span><span>สถานะใบแพทย์</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>
          ) : (
            filtered.map((b) => {
              const status = getCertStatus(b)
              const mc = (Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)
              return (
                <div key={b.id} className="grid grid-cols-7 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <span className="font-medium text-gray-700">{b.customers?.customer_name}</span>
                  <span className="text-gray-500">{mc?.exam_date || b.booking_date}</span>
                  <span className="text-gray-500 text-xs truncate flex items-center gap-1">
                    {b.location_name || '-'}
                    {b.location_url && (
                      <a href={b.location_url} target="_blank" rel="noreferrer"
                        className="text-[#185FA5] hover:text-blue-700 flex-shrink-0" title="เปิด Google Map">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                      </a>
                    )}
                  </span>
                  <span className="text-gray-700">{b.booked_count?.toLocaleString()} / <span className="text-[#185FA5] font-medium">{mc?.actual_count?.toLocaleString() ?? '-'}</span></span>
                  <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={mc?.cert_status || 'รอบันทึก'}
                      onChange={(e) => handleQuickCertStatus(b, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#185FA5] ${status.color}`}
                    >
                      <option value="รอบันทึก">รอบันทึก</option>
                      <option value="รอส่ง">รอส่งใบแพทย์</option>
                      <option value="เรียบร้อย">ส่งครบแล้ว</option>
                    </select>
                    {mc?.parcel_sent && <span className="text-xs" title="นำส่งพัสดุแล้ว">📦</span>}
                  </span>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จำนวนใบแพทย์</label>
                  <input type="text" inputMode="numeric" value={form.cert_count || ''}
                    onChange={(e) => setForm({...form, cert_count: Number(e.target.value.replace(/\D/g,''))})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
                </div>
                <div className="flex items-end pb-2">
                  <button type="button" onClick={() => setForm({...form, cert_count: form.actual_count})}
                    className="text-xs text-[#185FA5] hover:underline">
                    คัดลอกจากตรวจจริง
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <textarea value={form.doctor_note} onChange={(e) => setForm({...form, doctor_note: e.target.value})} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]" />
              </div>
              <label className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={form.parcel_sent}
                  onChange={(e) => setForm({...form, parcel_sent: e.target.checked})}
                  className="rounded border-gray-300 text-[#185FA5] focus:ring-[#185FA5]" />
                <span className="text-xs font-medium text-blue-700">📦 นำส่งพัสดุแล้ว</span>
              </label>
            </div>
            <button onClick={handleSaveMedical} className="w-full bg-[#185FA5] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0C447C] mb-4">
              บันทึกจำนวนตรวจจริง
            </button>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">ใบรับรองแพทย์</p>
              {certificates.map((cert) => (
                <div key={cert.id} className="flex items-center justify-between gap-2 p-2 bg-green-50 rounded-lg mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <IconCheck size={13} className="text-green-600 flex-shrink-0" />
                    <a href={cert.storage_url} target="_blank" className="text-xs text-green-700 hover:underline truncate">{cert.file_name}</a>
                  </div>
                  <button onClick={() => handleDeleteCertificate(cert.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0 text-xs">ลบ</button>
                </div>
              ))}

              {/* อัปโหลดไฟล์ตรง */}
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                <IconUpload size={15} />
                {uploading ? 'กำลังอัพโหลด...' : 'แนบไฟล์ใบรับรองแพทย์'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.zip" onChange={handleUploadFile} className="hidden" disabled={uploading} />
              </label>

              {/* แนบลิงก์ URL แทน */}
              <div className="mt-3 bg-sky-50 border border-sky-100 rounded-lg p-3">
                <p className="text-xs font-medium text-sky-700 mb-2 flex items-center gap-1">
                  <IconLink size={13} /> หรือแนบลิงก์ไฟล์ (Google Drive, Dropbox ฯลฯ)
                </p>
                <div className="space-y-2">
                  <input type="text" value={linkName} onChange={(e) => setLinkName(e.target.value)}
                    placeholder="ชื่อไฟล์/คำอธิบาย (ไม่บังคับ)"
                    className="w-full border border-sky-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full border border-sky-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  <button onClick={handleAddLink} disabled={savingLink || !linkUrl.trim()}
                    className="w-full py-2 text-xs bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50">
                    {savingLink ? 'กำลังบันทึก...' : '+ เพิ่มลิงก์'}
                  </button>
                </div>
                <p className="text-xs text-sky-500 mt-1.5">⚠️ ถ้าใช้ Google Drive อย่าลืมเปลี่ยนสิทธิ์แชร์เป็น "ทุกคนที่มีลิงก์" ก่อน ไม่งั้นคนอื่นเปิดดูไม่ได้</p>
              </div>
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