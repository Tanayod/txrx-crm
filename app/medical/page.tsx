'use client'

export const dynamic = 'force-dynamic'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconUpload, IconCheck, IconClock, IconAlertTriangle, IconSearch, IconDownload, IconLink, IconMicroscope } from '@tabler/icons-react'

export default function Medical() {
  const { user, role, ready, logout } = useAuth('/medical')
  const [cases, setCases] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [certificates, setCertificates] = useState<any[]>([])
  const [form, setForm] = useState({ actual_count: 0, cert_count: 0, hold_count: 0, doctor_note: '', exam_date: '', parcel_sent: false })
  const [loaded, setLoaded] = useState(false)

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
      let q = supabase.from('bookings').select('*, customers(customer_name), medical_cases(*), special_exams(*, special_exam_items(*))')
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
    setForm({ actual_count: mc?.actual_count || 0, cert_count: mc?.cert_count || 0, hold_count: mc?.hold_count || 0, doctor_note: mc?.doctor_note || '', exam_date: mc?.exam_date || booking.booking_date, parcel_sent: mc?.parcel_sent || false })
    if (mc?.id) await fetchCertificates(mc.id)
    else setCertificates([])
    setLinkUrl(''); setLinkName('')
    setShowModal(true)
  }

  const handleSaveMedical = async () => {
    const mc = Array.isArray(selected?.medical_cases) ? selected?.medical_cases?.[0] : selected?.medical_cases
    const hasSpecialExam = (selected?.special_exams && selected?.special_exams.length > 0)
    const allowedDays = hasSpecialExam ? 14 : 3

    const deadline = new Date(form.exam_date)
    deadline.setDate(deadline.getDate() + allowedDays)
    const deadlineStr = deadline.toISOString().slice(0, 10)

    const holdN = Math.max(0, Math.min(Number(form.hold_count) || 0, form.actual_count))
    if (mc?.id) {
      const { error } = await supabase.from('medical_cases').update({ actual_count: form.actual_count, cert_count: form.cert_count, hold_count: holdN, doctor_note: form.doctor_note, exam_date: form.exam_date, cert_deadline: deadlineStr, parcel_sent: form.parcel_sent }).eq('id', mc.id)
      if (error) { alert(`บันทึกไม่สำเร็จ: ${error.message}\n\nถ้าขึ้นว่าไม่มีคอลัมน์ hold_count ให้รัน SQL เพิ่มคอลัมน์ใน Supabase ก่อน`); return }
    } else {
      const { error } = await supabase.from('medical_cases').insert([{ booking_id: selected.id, actual_count: form.actual_count, cert_count: form.cert_count, hold_count: holdN, doctor_note: form.doctor_note, exam_date: form.exam_date, cert_deadline: deadlineStr, cert_status: 'รอส่ง', parcel_sent: form.parcel_sent }])
      if (error) { alert(`บันทึกไม่สำเร็จ: ${error.message}\n\nถ้าขึ้นว่าไม่มีคอลัมน์ hold_count ให้รัน SQL เพิ่มคอลัมน์ใน Supabase ก่อน`); return }
    }
    fetchCases(); setShowModal(false)
  }

  const uploadFileToGCS = async (file: File, folder: string): Promise<{ url: string, fileName: string } | null> => {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, folder, contentType: file.type || 'application/octet-stream' }),
      })
      if (!res.ok) return null
      const { uploadUrl, publicUrl, fileName } = await res.json()

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!uploadRes.ok) return null

      return { url: publicUrl, fileName }
    } catch (err) {
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

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return
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

  // จำนวนใบแพทย์ที่ลูกค้าขอ Hold (รองรับ record เก่าที่ใช้ cert_status='Hold')
  const heldOf = (mc: any) => {
    if (!mc) return 0
    const n = Number(mc.hold_count) || 0
    if (n > 0) return n
    if (mc.cert_status === 'Hold') return Math.max((mc.actual_count || 0) - (mc.cert_count || 0), 0) // legacy
    return 0
  }
  // ค้างส่งจริง = ตรวจจริง − ส่งแล้ว − Hold
  const pendingRealOf = (mc: any) =>
    mc ? Math.max((mc.actual_count || 0) - (mc.cert_count || 0) - heldOf(mc), 0) : 0

  // 🔹 ปรับระบบคำนวณสถานะใบแพทย์ รองรับเคสตรวจพิเศษ 14 วัน + Hold บางส่วน
  const getCertStatus = (booking: any) => {
    const mc = Array.isArray(booking.medical_cases) ? booking.medical_cases?.[0] : booking.medical_cases
    const hasSpecialExam = (booking.special_exams && booking.special_exams.length > 0)
    const held = heldOf(mc)

    if (!mc) return { label: 'รอบันทึก', color: 'bg-gray-100 text-gray-500', icon: IconClock, held: 0 }
    if (mc.cert_status === 'เรียบร้อย') return { label: 'ส่งครบแล้ว', color: 'bg-green-50 text-green-600', icon: IconCheck, held }
    if (mc.cert_status === 'รอข้อมูลแรงงาน') return { label: 'รอข้อมูลแรงงาน', color: 'bg-sky-50 text-sky-600', icon: IconClock, held }

    const pendingReal = pendingRealOf(mc)
    // ส่ง+Hold ครบแล้ว (ไม่มีค้างจริง) — ไม่ต้องเตือนเกินกำหนด
    if ((mc.actual_count || 0) > 0 && pendingReal === 0) {
      return held > 0
        ? { label: `ส่งครบ (Hold ${held})`, color: 'bg-slate-100 text-slate-600', icon: IconCheck, held }
        : { label: 'ส่งครบแล้ว', color: 'bg-green-50 text-green-600', icon: IconCheck, held }
    }

    const today = new Date()
    const examDate = new Date(mc.exam_date || booking.booking_date)
    const daysDiff = Math.floor((today.getTime() - examDate.getTime()) / 86400000)

    if (hasSpecialExam && daysDiff <= 14) {
      return { label: 'รอผล Lab (7-14 วัน)', color: 'bg-purple-50 text-purple-700', icon: IconClock, held }
    }

    const allowedDays = hasSpecialExam ? 14 : 3
    if (daysDiff > allowedDays) {
      return { label: `เกิน ${allowedDays} วัน!`, color: 'bg-red-50 text-red-600', icon: IconAlertTriangle, held }
    }
    return { label: 'รอส่งใบแพทย์', color: 'bg-amber-50 text-amber-600', icon: IconClock, held }
  }

  const handleQuickCertStatus = async (b: any, newStatus: string) => {
    const mc = Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases
    const hasSpecialExam = (b.special_exams && b.special_exams.length > 0)
    const allowedDays = hasSpecialExam ? 14 : 3

    let err: any = null
    let rows: any[] | null = null
    if (mc?.id) {
      const res = await supabase.from('medical_cases').update({ cert_status: newStatus }).eq('id', mc.id).select()
      err = res.error; rows = res.data
    } else {
      const deadline = new Date(b.booking_date)
      deadline.setDate(deadline.getDate() + allowedDays)
      const res = await supabase.from('medical_cases').insert([{
        booking_id: b.id, actual_count: 0, cert_count: 0,
        exam_date: b.booking_date, cert_deadline: deadline.toISOString().slice(0,10),
        cert_status: newStatus,
      }]).select()
      err = res.error; rows = res.data
    }
    if (err) {
      alert(`เปลี่ยนสถานะไม่สำเร็จ (${err.code || 'error'}): ${err.message || err}` + (err.details ? `\n${err.details}` : ''))
      return
    }
    if (!rows || rows.length === 0) {
      alert('บันทึกแล้วแต่ไม่มีแถวถูกแก้ (อาจติดสิทธิ์ RLS ของตาราง medical_cases) — ลองรีเฟรชแล้วลองใหม่ ถ้ายังไม่ได้แจ้งผมพร้อมข้อความนี้')
      return
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
    if (filterStatus === 'มี Hold') { if (heldOf(mc) <= 0) return false }
    else if (filterStatus && status.label !== filterStatus) return false
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
      const spWorkers = b.special_exams?.reduce((s: number, e: any) => s + (e.total_workers || 0), 0) || 0
      return {
        'เลขจอง': b.case_number,
        'ลูกค้า': b.customers?.customer_name,
        'วันที่ตรวจ': mc?.exam_date || b.booking_date,
        'จำนวนจอง': b.booked_count,
        'จำนวนตรวจจริง': mc?.actual_count || '-',
        'จำนวนตรวจพิเศษ': spWorkers,
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

  if (!ready) return <div className="min-h-screen bg-[#F6F7FB] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F6F7FB]">
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

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="ค้นหาลูกค้า หรือเลขจอง..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchCases()}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
            <button onClick={() => fetchCases()}
              className="bg-[#4338CA] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#312E81] transition-colors flex-shrink-0">
              ค้นหา
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่เริ่ม</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">วันที่สิ้นสุด</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">สถานะใบแพทย์</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
                <option value="">ทั้งหมด</option>
                <option>รอบันทึก</option>
                <option>รอส่งใบแพทย์</option>
                <option>รอผล Lab (7-14 วัน)</option>
                <option>เกิน 3 วัน!</option>
                <option>เกิน 14 วัน!</option>
                <option>ส่งครบแล้ว</option>
                <option>มี Hold</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-50">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (min)</label>
              <input type="number" value={filterBookedMin} onChange={(e) => setFilterBookedMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนจอง (max)</label>
              <input type="number" value={filterBookedMax} onChange={(e) => setFilterBookedMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">จำนวนตรวจจริง</label>
              <select value={filterHasActual} onChange={(e) => setFilterHasActual(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
                <option value="">ทั้งหมด</option>
                <option value="มี">มีแล้ว</option>
                <option value="ไม่มี">ยังไม่มี</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (min)</label>
              <input type="number" value={filterActualMin} onChange={(e) => setFilterActualMin(e.target.value)}
                placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">ตรวจจริง (max)</label>
              <input type="number" value={filterActualMax} onChange={(e) => setFilterActualMax(e.target.value)}
                placeholder="9999" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
            </div>
          </div>
          <div className="flex justify-between items-center pt-1">
            <p className="text-xs text-gray-400">พบ {filtered.length} รายการ</p>
            <button onClick={clearFilters} className="text-xs text-[#4338CA] hover:underline">ล้างตัวกรอง</button>
          </div>
        </div>

        {/* 🔹 ตารางหลัก (เพิ่มคอลัมน์ตรวจพิเศษ) */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-10 gap-2 px-5 py-2.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100 font-semibold">
            <span>เลขจอง</span><span className="col-span-2">ลูกค้า</span><span>วันที่ตรวจ</span>
            <span>สถานที่</span><span>จอง / จริง</span><span>ตรวจพิเศษ</span><span>ผลต่าง</span><span>สถานะใบแพทย์</span><span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>
          ) : (
            filtered.map((b) => {
              const status = getCertStatus(b)
              const mc = (Array.isArray(b.medical_cases) ? b.medical_cases?.[0] : b.medical_cases)
              const certCount = mc?.cert_count ?? null
              const actualCount = mc?.actual_count ?? null
              // ✅ แก้ไข: ต้องมี actual_count ที่ "ถูกกรอกแล้วจริง" (>0) ถึงจะคำนวณผลต่างได้
              // ถ้ายังไม่มี medical_cases หรือ actual_count ยังเป็น 0/ว่าง แปลว่ายังไม่ได้บันทึกตรวจจริง
              // ไม่ควรฟันธงว่า "ครบ" หรือ "ขาด" ให้โชว์ "-" แทน
              const hasActualData = !!mc?.id && actualCount !== null && actualCount > 0
              const diff = hasActualData ? (certCount ?? 0) - (actualCount as number) : null

              const spWorkers = b.special_exams?.reduce((s: number, e: any) => s + (e.total_workers || 0), 0) || 0

              return (
                <div key={b.id} className="grid grid-cols-10 gap-2 px-5 py-3 border-b border-gray-50 text-sm hover:bg-gray-50 items-center">
                  <span className="text-xs text-gray-400 font-mono">{b.case_number}</span>
                  <span className="col-span-2 font-medium text-gray-700 truncate">{b.customers?.customer_name}</span>
                  <span className="text-gray-500 text-xs">{mc?.exam_date || b.booking_date}</span>
                  <span className="text-gray-500 text-xs truncate flex items-center gap-1">
                    {b.location_name || '-'}
                    {b.location_url && (
                      <a href={b.location_url} target="_blank" rel="noreferrer"
                        className="text-[#4338CA] hover:text-blue-700 flex-shrink-0" title="เปิด Google Map">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                      </a>
                    )}
                  </span>
                  <span className="text-gray-700 text-xs">{b.booked_count?.toLocaleString()} / <span className="text-[#4338CA] font-medium">{mc?.actual_count?.toLocaleString() ?? '-'}</span></span>
                  
                  {/* 🔹 คอลัมน์ตรวจพิเศษ */}
                  <span className="text-xs">
                    {spWorkers > 0 ? (
                      <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md font-medium flex items-center gap-0.5 w-fit">
                        <IconMicroscope size={11}/>{spWorkers} คน
                      </span>
                    ) : <span className="text-gray-300">-</span>}
                  </span>

                  {/* 🔹 คอลัมน์ผลต่าง (แก้ไขแล้ว) */}
                  <span>
                    {diff === null ? (
                      // ยังไม่ได้บันทึกจำนวนตรวจจริง -> ไม่ฟันธงว่าครบหรือขาด
                      <span className="text-xs text-gray-300">-</span>
                    ) : diff === 0 ? (
                      <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded-md font-medium">ครบ</span>
                    ) : diff < 0 ? (
                      <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-medium">ขาด {Math.abs(diff)}</span>
                    ) : (
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">เกิน {diff}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={mc?.cert_status || 'รอบันทึก'}
                      onChange={(e) => handleQuickCertStatus(b, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4338CA] ${status.color}`}
                    >
                      <option value="รอบันทึก">รอบันทึก</option>
                      <option value="รอข้อมูลแรงงาน">รอข้อมูลแรงงาน</option>
                      <option value="รอส่ง">รอส่งใบแพทย์</option>
                      <option value="เรียบร้อย">ส่งครบแล้ว</option>
                    </select>
                    {status.held > 0 && (
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium" title="ลูกค้าขอ Hold ใบแพทย์">Hold {status.held}</span>
                    )}
                    {mc?.parcel_sent && <span className="text-xs" title="นำส่งพัสดุแล้ว">📦</span>}
                  </span>
                  <button onClick={() => handleOpenModal(b)} className="text-xs text-[#4338CA] hover:underline text-right font-medium">บันทึก / แนบไฟล์</button>
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จำนวนตรวจจริง</label>
                  <input type="text" inputMode="numeric" value={form.actual_count || ''}
                    onChange={(e) => setForm({...form, actual_count: Number(e.target.value.replace(/\D/g,''))})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จำนวนใบแพทย์</label>
                  <input type="text" inputMode="numeric" value={form.cert_count || ''}
                    onChange={(e) => setForm({...form, cert_count: Number(e.target.value.replace(/\D/g,''))})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
                </div>
                <div className="flex items-end pb-2">
                  <button type="button" onClick={() => setForm({...form, cert_count: form.actual_count})}
                    className="text-xs text-[#4338CA] hover:underline">
                    คัดลอกจากตรวจจริง
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">จำนวน Hold (ลูกค้าขอพักใบแพทย์)</label>
                <input type="text" inputMode="numeric" value={form.hold_count || ''}
                  onChange={(e) => setForm({...form, hold_count: Number(e.target.value.replace(/\D/g,''))})}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
                <p className="text-[11px] text-gray-400 mt-1">
                  ค้างส่งจริง = ตรวจ {form.actual_count || 0} − ส่งแล้ว {form.cert_count || 0} − Hold {Math.min(form.hold_count || 0, form.actual_count || 0)} =
                  <b className="text-gray-600"> {Math.max((form.actual_count||0) - (form.cert_count||0) - Math.min(form.hold_count||0, form.actual_count||0), 0)}</b> คน
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <textarea value={form.doctor_note} onChange={(e) => setForm({...form, doctor_note: e.target.value})} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
              </div>
              <label className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={form.parcel_sent}
                  onChange={(e) => setForm({...form, parcel_sent: e.target.checked})}
                  className="rounded border-gray-300 text-[#4338CA] focus:ring-[#4338CA]" />
                <span className="text-xs font-medium text-blue-700">📦 นำส่งพัสดุแล้ว</span>
              </label>
            </div>
            <button onClick={handleSaveMedical} className="w-full bg-[#4338CA] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#312E81] mb-4">
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

              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                <IconUpload size={15} />
                {uploading ? 'กำลังอัพโหลด...' : 'แนบไฟล์ใบรับรองแพทย์'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.zip" onChange={handleUploadFile} className="hidden" disabled={uploading} />
              </label>

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