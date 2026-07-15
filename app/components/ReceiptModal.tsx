'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { numberToThaiBahtText } from '@/lib/thaiBahtText'
import { IconX, IconPrinter, IconBan, IconUpload } from '@tabler/icons-react'

type ReceiptItem = {
  description: string
  detail?: string
  quantity: number
  unit_price: number
  discount?: number
  vat: string // 'ไม่มี' | '7%'
  amount: number
}

type Props = {
  mode: 'create' | 'view'
  booking?: any
  payment?: any
  companySettings: any
  existingReceipt?: any
  onClose: () => void
  onIssued?: (receipt: any) => void
  onCancelled?: () => void
}

export default function ReceiptModal({ mode, booking, payment, companySettings, existingReceipt, onClose, onIssued, onCancelled }: Props) {
  const [step, setStep] = useState<'edit' | 'done'>(mode === 'view' ? 'done' : 'edit')
  const [saving, setSaving] = useState(false)
  const [savedReceipt, setSavedReceipt] = useState<any>(existingReceipt || null)

  // ค่าเริ่มต้นตอนสร้างใหม่ ดึงจากข้อมูลจริงของ booking/payment
  const c = booking?.customers || {}
  const [customerName, setCustomerName] = useState(existingReceipt?.customer_snapshot?.name ?? (c.customer_code ? `${c.customer_code} ${c.customer_name}` : c.customer_name) ?? '')
  const [customerAddress, setCustomerAddress] = useState(existingReceipt?.customer_snapshot?.address ?? c.address ?? '')
  const [customerTaxId, setCustomerTaxId] = useState(existingReceipt?.customer_snapshot?.tax_id ?? c.tax_id ?? '')
  const [contactName, setContactName] = useState(companySettings?.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(companySettings?.phone ?? '')
  const [contactEmail, setContactEmail] = useState(companySettings?.email ?? '')
  const [referenceNo, setReferenceNo] = useState(existingReceipt?.reference_no ?? payment?.invoice_no ?? '')
  const [note, setNote] = useState(existingReceipt?.note ?? payment?.note ?? '')
  // วันที่ออกใบเสร็จ แก้เองได้ (เผื่อออกย้อนหลังหรือล่วงหน้า) ค่าเริ่มต้นเป็นวันนี้
  const [issueDate, setIssueDate] = useState(existingReceipt?.issue_date ?? new Date().toISOString().slice(0, 10))

  // ===== คลังลายเซ็น: เลือกจาก dropdown แทนพิมพ์ชื่อเฉยๆ เพื่อให้รูปลายเซ็นตรงกับชื่อเสมอ =====
  const [signatures, setSignatures] = useState<any[]>([])
  const [signaturesLoaded, setSignaturesLoaded] = useState(false)
  const [issuerSignatureId, setIssuerSignatureId] = useState(existingReceipt?.issuer_signature_id ?? '')
  const [approverSignatureId, setApproverSignatureId] = useState(existingReceipt?.approver_signature_id ?? '')
  const [issuerName, setIssuerName] = useState(existingReceipt?.issuer_name ?? companySettings?.contact_name ?? '')
  const [approverName, setApproverName] = useState(existingReceipt?.approver_name ?? companySettings?.contact_name ?? '')
  const [receiverName, setReceiverName] = useState(existingReceipt?.receiver_name ?? customerName ?? '')
  const [addingFor, setAddingFor] = useState<'issuer' | 'approver' | null>(null)
  const [newSigName, setNewSigName] = useState('')
  const [newSigFile, setNewSigFile] = useState<File | null>(null)
  const [savingSignature, setSavingSignature] = useState(false)

  const fetchSignatures = async () => {
    const { data } = await supabase.from('signatures').select('*').order('name', { ascending: true })
    setSignatures(data || [])
  }
  if (!signaturesLoaded) { fetchSignatures(); setSignaturesLoaded(true) }

  // อัปโหลดไฟล์ผ่าน API กลาง (/api/upload) ซึ่งจะส่งไฟล์ต่อไปเก็บที่ Google Cloud Storage
  const uploadFileToGCS = async (file: File, folder: string): Promise<{ url: string, fileName: string } | null> => {
    try {
      // 1. ขอ "ลิงก์อัปโหลดชั่วคราว" จาก backend ก่อน (ส่งแค่ชื่อไฟล์ ไม่ใช่ตัวไฟล์ ไม่มีทางติด limit ของ Vercel)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, folder, contentType: file.type || 'application/octet-stream' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('ขอลิงก์อัปโหลดไม่สำเร็จ:', err)
        return null
      }
      const { uploadUrl, publicUrl, fileName } = await res.json()

      // 2. อัปโหลดไฟล์จริง "ตรงไปที่ Google Cloud Storage เลย" ไม่ผ่าน Vercel อีกต่อไป
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!uploadRes.ok) {
        console.error('อัปโหลดไป GCS ไม่สำเร็จ:', uploadRes.status)
        return null
      }

      return { url: publicUrl, fileName }
    } catch (err) {
      console.error('อัปโหลดไม่สำเร็จ:', err)
      return null
    }
  }

  const handleAddSignature = async () => {
    if (!newSigName || !newSigFile || !addingFor) return
    setSavingSignature(true)
    const uploaded = await uploadFileToGCS(newSigFile, 'signatures')
    if (uploaded) {
      const { data: inserted } = await supabase.from('signatures').insert([{ name: newSigName, image_url: uploaded.url }]).select().single()
      if (inserted) {
        setSignatures(prev => [...prev, inserted].sort((a,b) => a.name.localeCompare(b.name)))
        if (addingFor === 'issuer') { setIssuerSignatureId(inserted.id); setIssuerName(inserted.name) }
        else { setApproverSignatureId(inserted.id); setApproverName(inserted.name) }
      }
    }
    setNewSigName(''); setNewSigFile(null); setAddingFor(null)
    setSavingSignature(false)
  }

  // หัก ณ ที่จ่าย 3% — คิดจากค่าบริการตรวจก่อน VAT เท่านั้น (ไม่รวมค่าข้าว/ตรวจพิเศษ)
  const [useWht, setUseWht] = useState(existingReceipt ? (existingReceipt.wht_amount > 0) : (payment?.use_wht || false))

  const buildDefaultItems = (): ReceiptItem[] => {
    const items: ReceiptItem[] = []
    const workerTotal = (payment?.worker_count || 0) * (payment?.price_per_worker || 0)
    if (workerTotal > 0) {
      items.push({
        description: 'ตรวจสุขภาพแรงงานต่างด้าว',
        detail: `จำนวน ${payment?.worker_count || 0} คน${booking?.booking_date ? ` วันที่ ${booking.booking_date}` : ''}`,
        quantity: payment?.worker_count || 0,
        unit_price: payment?.price_per_worker || 0,
        discount: 0,
        vat: payment?.use_vat ? '7%' : 'ไม่มี',
        amount: workerTotal,
      })
    }
    const specialTotal = (booking?.special_exams || []).reduce((s: number, e: any) => s + (e.total_amount || 0), 0)
    if (specialTotal > 0) {
      items.push({
        description: 'ตรวจสุขภาพพิเศษ',
        detail: '',
        quantity: 1,
        unit_price: specialTotal,
        discount: 0,
        vat: 'ไม่มี',
        amount: specialTotal,
      })
    }
    // ค่าข้าวไฟล์ทบิน (ถ้ามี) — ไม่คิด VAT และไม่เป็นฐานหัก ณ ที่จ่าย
    const mealTotal = (booking?.meal_price || 0) * (booking?.meal_count || 0) * (booking?.booked_count || 0)
    if (mealTotal > 0) {
      items.push({
        description: 'ค่าอาหารระหว่างเดินทาง (ไฟล์ทบิน)',
        detail: `฿${booking?.meal_price || 0} x ${booking?.meal_count || 0} มื้อ x ${booking?.booked_count || 0} คน`,
        quantity: 1,
        unit_price: mealTotal,
        discount: 0,
        vat: 'ไม่มี',
        amount: mealTotal,
      })
    }
    return items
  }

  const [items, setItems] = useState<ReceiptItem[]>(existingReceipt?.items ?? buildDefaultItems())

  const subtotal = items.reduce((s, it) => s + (it.amount || 0), 0)
  const vatAmount = existingReceipt?.vat_amount ?? items.reduce((s, it) => it.vat === '7%' ? s + Math.round(it.amount * 0.07 * 100) / 100 : s, 0)
  const totalAmount = existingReceipt ? existingReceipt.total_amount : Math.round((subtotal + vatAmount) * 100) / 100
  const whtBase = (payment?.worker_count || 0) * (payment?.price_per_worker || 0)
  const whtAmount = existingReceipt?.wht_amount ?? (useWht ? Math.round(whtBase * 0.03 * 100) / 100 : 0)
  const netPayable = Math.round((totalAmount - whtAmount) * 100) / 100
  const amountPaid = existingReceipt?.amount_paid ?? payment?.amount_received ?? netPayable

  const updateItem = (i: number, field: keyof ReceiptItem, value: any) => {
    const updated = [...items]
    ;(updated[i] as any)[field] = value
    if (field === 'quantity' || field === 'unit_price') {
      updated[i].amount = Math.round((Number(updated[i].quantity) || 0) * (Number(updated[i].unit_price) || 0) * 100) / 100
    }
    setItems(updated)
  }

  const handleConfirmIssue = async () => {
    setSaving(true)
    const { data: receiptNoData } = await supabase.rpc('get_next_receipt_no')
    const receiptNo = receiptNoData as string
    const issuerSig = signatures.find(s => s.id === issuerSignatureId)
    const approverSig = signatures.find(s => s.id === approverSignatureId)

    const payload = {
      receipt_no: receiptNo,
      booking_id: booking.id,
      payment_id: payment.id,
      customer_id: booking.customer_id,
      issue_date: issueDate,
      reference_no: referenceNo || null,
      items,
      customer_snapshot: {
        name: customerName, address: customerAddress, tax_id: customerTaxId,
      },
      company_snapshot: { ...(companySettings || {}), contact_name: contactName, phone: contactPhone, email: contactEmail },
      issuer_name: issuerName,
      issuer_signature_id: issuerSignatureId || null,
      issuer_signature_url: issuerSig?.image_url || null,
      approver_name: approverName,
      approver_signature_id: approverSignatureId || null,
      approver_signature_url: approverSig?.image_url || null,
      receiver_name: receiverName,
      subtotal,
      vat_amount: vatAmount,
      wht_amount: whtAmount,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      payment_method: payment?.method || '',
      bank_account_id: payment?.bank_account_id || null,
      paid_date: payment?.paid_at ? payment.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      note,
    }
    const { data: inserted } = await supabase.from('receipts').insert([payload]).select().single()
    setSaving(false)
    if (inserted) {
      setSavedReceipt(inserted)
      setStep('done')
      onIssued?.(inserted)
    }
  }

  const handlePrint = () => window.print()

  const handleCancelReceipt = async () => {
    if (!savedReceipt?.id) return
    const reason = window.prompt('ระบุเหตุผลที่ยกเลิกใบเสร็จนี้ (ไม่บังคับ):') || ''
    await supabase.from('receipts').update({ is_cancelled: true, cancelled_at: new Date().toISOString(), cancelled_reason: reason }).eq('id', savedReceipt.id)
    setSavedReceipt({ ...savedReceipt, is_cancelled: true, cancelled_reason: reason })
    onCancelled?.()
  }

  const finalReceipt = savedReceipt

  // ===== ขั้นตอนที่ 1: ตรวจสอบ/แก้ไขข้อมูลก่อนออกใบเสร็จจริง =====
  if (step === 'edit') {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <p className="text-base font-semibold text-gray-800">ตรวจสอบข้อมูลก่อนออกใบเสร็จ</p>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={20}/></button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-gray-400">เลขที่เอกสารจะรันอัตโนมัติตอนกดยืนยัน (แก้ไขเองไม่ได้)</p>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">ชื่อลูกค้า (แสดงบนใบเสร็จ)</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">ที่อยู่ลูกค้า</label>
              <textarea value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">เลขประจำตัวผู้เสียภาษี</label>
                <input value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">เลขที่อ้างอิง (invoice)</label>
                <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <label className="text-xs font-semibold text-amber-700 mb-1 block">วันที่ออกใบเสร็จ</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
              <p className="text-xs text-amber-600 mt-1">ค่าเริ่มต้นคือวันนี้ แก้ไขได้ถ้าต้องการออกย้อนหลังหรือล่วงหน้า</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">ผู้ติดต่อกลับ (ฝั่งบริษัทเรา แสดงในช่อง "ติดต่อกลับที่")</p>
              <div className="grid grid-cols-3 gap-3">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="ชื่อผู้ติดต่อ"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="เบอร์โทร"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="อีเมล"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
              </div>
            </div>

            {/* ===== คลังลายเซ็น: เลือกผู้ออก / ผู้อนุมัติ พร้อมรูปลายเซ็นจริง ===== */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-600">ลายเซ็นผู้ออกเอกสาร / ผู้อนุมัติ (เลือกจากคลัง หรือเพิ่มใหม่)</p>

              {/* ผู้ออกเอกสาร */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ผู้ออกเอกสาร (ผู้ขาย)</label>
                <div className="flex gap-2">
                  <select value={issuerSignatureId}
                    onChange={(e) => {
                      const sig = signatures.find(s => s.id === e.target.value)
                      setIssuerSignatureId(e.target.value)
                      if (sig) setIssuerName(sig.name)
                    }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option value="">-- ไม่มีลายเซ็น (เซ็นสด) --</option>
                    {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setAddingFor(addingFor === 'issuer' ? null : 'issuer')}
                    className="px-3 py-2 text-xs border border-[#185FA5] text-[#185FA5] rounded-lg hover:bg-blue-50 whitespace-nowrap">
                    + เพิ่มใหม่
                  </button>
                </div>
                {!issuerSignatureId && (
                  <input value={issuerName} onChange={(e) => setIssuerName(e.target.value)} placeholder="หรือพิมพ์ชื่อเฉยๆ (ไม่มีรูปลายเซ็น)"
                    className="w-full mt-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                )}
                {addingFor === 'issuer' && (
                  <div className="mt-2 p-2.5 bg-white border border-blue-200 rounded-lg space-y-2">
                    <input value={newSigName} onChange={(e) => setNewSigName(e.target.value)} placeholder="ชื่อเจ้าของลายเซ็น"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-xs text-gray-500">
                      <IconUpload size={13}/>{newSigFile ? newSigFile.name : 'เลือกไฟล์รูปลายเซ็น (.png/.jpg)'}
                      <input type="file" accept=".png,.jpg,.jpeg" onChange={(e) => setNewSigFile(e.target.files?.[0] || null)} className="hidden"/>
                    </label>
                    <button type="button" onClick={handleAddSignature} disabled={savingSignature || !newSigName || !newSigFile}
                      className="w-full py-1.5 text-xs bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50">
                      {savingSignature ? 'กำลังบันทึก...' : 'บันทึกลายเซ็นนี้เข้าคลัง'}
                    </button>
                  </div>
                )}
              </div>

              {/* ผู้อนุมัติเอกสาร */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ผู้อนุมัติเอกสาร (ผู้ขาย)</label>
                <div className="flex gap-2">
                  <select value={approverSignatureId}
                    onChange={(e) => {
                      const sig = signatures.find(s => s.id === e.target.value)
                      setApproverSignatureId(e.target.value)
                      if (sig) setApproverName(sig.name)
                    }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]">
                    <option value="">-- ไม่มีลายเซ็น (เซ็นสด) --</option>
                    {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setAddingFor(addingFor === 'approver' ? null : 'approver')}
                    className="px-3 py-2 text-xs border border-[#185FA5] text-[#185FA5] rounded-lg hover:bg-blue-50 whitespace-nowrap">
                    + เพิ่มใหม่
                  </button>
                </div>
                {!approverSignatureId && (
                  <input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="หรือพิมพ์ชื่อเฉยๆ (ไม่มีรูปลายเซ็น)"
                    className="w-full mt-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                )}
                {addingFor === 'approver' && (
                  <div className="mt-2 p-2.5 bg-white border border-blue-200 rounded-lg space-y-2">
                    <input value={newSigName} onChange={(e) => setNewSigName(e.target.value)} placeholder="ชื่อเจ้าของลายเซ็น"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-xs text-gray-500">
                      <IconUpload size={13}/>{newSigFile ? newSigFile.name : 'เลือกไฟล์รูปลายเซ็น (.png/.jpg)'}
                      <input type="file" accept=".png,.jpg,.jpeg" onChange={(e) => setNewSigFile(e.target.files?.[0] || null)} className="hidden"/>
                    </label>
                    <button type="button" onClick={handleAddSignature} disabled={savingSignature || !newSigName || !newSigFile}
                      className="w-full py-1.5 text-xs bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50">
                      {savingSignature ? 'กำลังบันทึก...' : 'บันทึกลายเซ็นนี้เข้าคลัง'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">ผู้รับเอกสาร (ลูกค้า)</label>
                <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="ชื่อผู้รับเอกสารฝั่งลูกค้า"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
                <p className="text-xs text-gray-400 mt-1">ฝั่งลูกค้าจะเป็นเส้นว่างให้เซ็นสดเสมอ (ไม่มีคลังลายเซ็นลูกค้า)</p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-rose-50 border border-rose-100 rounded-lg p-3">
              <input type="checkbox" checked={useWht} onChange={(e) => setUseWht(e.target.checked)} className="rounded border-gray-300"/>
              <span className="text-xs font-medium text-rose-700">หัก ณ ที่จ่าย 3% (คำนวณจากค่าตรวจก่อน VAT ฿{whtBase.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})})</span>
            </label>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">รายการ</p>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 mb-1.5 items-center">
                  <input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)}
                    className="col-span-5 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"/>
                  <input type="number" value={it.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                    className="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" placeholder="จำนวน"/>
                  <input type="number" value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))}
                    className="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" placeholder="ราคา"/>
                  <span className="col-span-3 text-xs text-right font-medium text-gray-700 pr-1">฿{(it.amount || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">หมายเหตุ</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5]"/>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">ยอดรวมทั้งสิ้น</span>
                <span className="text-lg font-bold text-[#185FA5]">฿{totalAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
              </div>
              {whtAmount > 0 && (
                <>
                  <div className="flex justify-between items-center text-xs text-rose-600">
                    <span>หัก ณ ที่จ่าย 3%</span>
                    <span>- ฿{whtAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-blue-100 pt-1">
                    <span className="text-sm font-semibold text-gray-700">ยอดรับชำระสุทธิ</span>
                    <span className="text-base font-bold text-emerald-600">฿{netPayable.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">ยกเลิก</button>
            <button onClick={handleConfirmIssue} disabled={saving}
              className="px-5 py-2 text-sm bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C] disabled:opacity-50 font-medium">
              {saving ? 'กำลังออกเลขที่เอกสาร...' : 'ยืนยันออกใบเสร็จ'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== ขั้นตอนที่ 2: แสดงใบเสร็จสำหรับพิมพ์/บันทึกเป็น PDF (2 ชุด: ต้นฉบับ + สำเนา) =====
  const r = finalReceipt
  if (!r) return null
  const custSnap = r.customer_snapshot || {}
  const compSnap = r.company_snapshot || companySettings || {}
  const rNetPayable = Math.round(((r.total_amount || 0) - (r.wht_amount || 0)) * 100) / 100

  const ReceiptCopy = ({ label }: { label: string }) => (
    <div className="bg-white p-8 text-sm text-gray-800" style={{ pageBreakAfter: 'always', minHeight: '29.7cm', boxSizing: 'border-box' }}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="font-bold text-lg text-sky-600">{compSnap.company_name}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">({label})</p>
          <p className="text-2xl font-bold text-emerald-600">ใบเสร็จรับเงิน</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 border-t border-b border-gray-200 py-3 mb-3">
        <div className="text-xs space-y-0.5">
          <p><span className="text-gray-500">ผู้ขาย :</span> {compSnap.company_name}</p>
          <p><span className="text-gray-500">ที่อยู่ :</span> {compSnap.address}</p>
          <p><span className="text-gray-500">เลขที่ภาษี :</span> {compSnap.tax_id} {compSnap.branch ? `(${compSnap.branch})` : ''}</p>
        </div>
        <div className="text-xs space-y-0.5 text-right">
          <p><span className="text-gray-500">เลขที่เอกสาร :</span> <span className="font-semibold">{r.receipt_no}</span></p>
          <p><span className="text-gray-500">วันที่ออก :</span> {r.issue_date}</p>
          {r.reference_no && <p><span className="text-gray-500">อ้างอิง :</span> {r.reference_no}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-4 text-xs">
        <div className="space-y-0.5">
          <p className="text-gray-500">ลูกค้า :</p>
          <p className="font-medium">{custSnap.name}</p>
          <p className="text-gray-600">{custSnap.address}</p>
          {custSnap.tax_id && <p className="text-gray-500">เลขที่ภาษี : {custSnap.tax_id}</p>}
        </div>
        <div className="space-y-0.5 text-right">
          <p className="text-gray-500">ติดต่อกลับที่ :</p>
          {compSnap.contact_name && <p>{compSnap.contact_name}</p>}
          {compSnap.phone && <p>{compSnap.phone}</p>}
          {compSnap.email && <p>{compSnap.email}</p>}
        </div>
      </div>
      <table className="w-full text-xs mb-6">
        <thead>
          <tr className="bg-emerald-50 text-gray-600">
            <th className="text-left p-2 rounded-l-md">คำอธิบาย</th>
            <th className="text-right p-2">จำนวน</th>
            <th className="text-right p-2">ราคา</th>
            <th className="text-right p-2">VAT</th>
            <th className="text-right p-2 rounded-r-md">มูลค่า</th>
          </tr>
        </thead>
        <tbody>
          {(r.items || []).map((it: ReceiptItem, i: number) => (
            <tr key={i} className="border-b border-gray-100 align-top">
              <td className="p-2">
                <p className="font-medium">{i + 1}. {it.description}</p>
                {it.detail && <p className="text-gray-400">{it.detail}</p>}
              </td>
              <td className="text-right p-2">{it.quantity?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
              <td className="text-right p-2">{it.unit_price?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
              <td className="text-right p-2">{it.vat}</td>
              <td className="text-right p-2">{it.amount?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end mb-4">
        <div className="w-72 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">มูลค่าก่อนภาษี</span><span>{r.subtotal?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} บาท</span></div>
          {r.vat_amount > 0 && <div className="flex justify-between"><span className="text-gray-500">ภาษีมูลค่าเพิ่ม 7%</span><span>{r.vat_amount?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} บาท</span></div>}
          <div className="flex justify-between border-t border-gray-200 pt-1 font-bold text-sm"><span>จำนวนเงินทั้งสิ้น</span><span>{r.total_amount?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} บาท</span></div>
          {r.wht_amount > 0 && (
            <>
              <div className="flex justify-between text-rose-600"><span>หัก ณ ที่จ่าย 3%</span><span>-{r.wht_amount?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} บาท</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 font-bold text-sm"><span>ยอดรับชำระสุทธิ</span><span>{rNetPayable.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} บาท</span></div>
            </>
          )}
          <p className="text-right text-gray-400 italic">({numberToThaiBahtText(r.wht_amount > 0 ? rNetPayable : r.total_amount)})</p>
        </div>
      </div>
      <div className="border-t border-gray-200 pt-3 mb-6 text-xs">
        <p className="font-semibold text-gray-600 mb-1">การชำระเงิน</p>
        <div className="flex justify-between">
          <span>วันที่ชำระ : {r.paid_date} · วิธีชำระ : {r.payment_method === 'transfer' ? 'โอนเงิน' : r.payment_method === 'cash' ? 'เงินสด' : r.payment_method}</span>
          <span className="font-semibold">{r.amount_paid?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} บาท</span>
        </div>
      </div>
      {r.note && <p className="text-xs text-gray-500 mb-6">หมายเหตุ : {r.note}</p>}

      {/* ช่องลายเซ็น: ผู้ออกเอกสาร / ผู้อนุมัติเอกสาร / ผู้รับเอกสาร */}
      <div className="grid grid-cols-3 gap-6 mt-10 text-xs text-center">
        <div>
          {r.issuer_signature_url ? (
            <img src={r.issuer_signature_url} alt="ลายเซ็นผู้ออกเอกสาร" className="h-14 mx-auto object-contain"/>
          ) : (
            <div className="border-b border-gray-400 h-12"></div>
          )}
          <p className="mt-1 font-medium text-gray-700">{r.issuer_name || compSnap.contact_name || '-'}</p>
          <p className="text-gray-400">ผู้ออกเอกสาร (ผู้ขาย)</p>
          <p className="text-gray-400">{r.issue_date}</p>
        </div>
        <div>
          {r.approver_signature_url ? (
            <img src={r.approver_signature_url} alt="ลายเซ็นผู้อนุมัติ" className="h-14 mx-auto object-contain"/>
          ) : (
            <div className="border-b border-gray-400 h-12"></div>
          )}
          <p className="mt-1 font-medium text-gray-700">{r.approver_name || compSnap.contact_name || '-'}</p>
          <p className="text-gray-400">ผู้อนุมัติเอกสาร (ผู้ขาย)</p>
          <p className="text-gray-400">{r.issue_date}</p>
        </div>
        <div>
          <div className="border-b border-gray-400 h-12"></div>
          <p className="mt-1 font-medium text-gray-700">{r.receiver_name || custSnap.name || '-'}</p>
          <p className="text-gray-400">ผู้รับเอกสาร (ลูกค้า)</p>
          <p className="text-gray-400">&nbsp;</p>
        </div>
      </div>
      {r.is_cancelled && (
        <p className="text-center text-red-500 font-bold text-lg mt-6">** ใบเสร็จฉบับนี้ถูกยกเลิกแล้ว {r.cancelled_reason ? `(${r.cancelled_reason})` : ''} **</p>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4 print:p-0 print:bg-white">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[95vh] overflow-y-auto print:max-w-full print:shadow-none print:rounded-none print:max-h-full">
        <div className="no-print p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <p className="text-sm font-semibold text-gray-800">ใบเสร็จรับเงิน {r.receipt_no}</p>
            {r.is_cancelled && <p className="text-xs text-red-500">ยกเลิกแล้ว</p>}
          </div>
          <div className="flex gap-2">
            {!r.is_cancelled && (
              <button onClick={handleCancelReceipt} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                <IconBan size={14}/> ยกเลิกใบเสร็จ
              </button>
            )}
            <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#185FA5] text-white rounded-lg hover:bg-[#0C447C]">
              <IconPrinter size={14}/> พิมพ์ / บันทึกเป็น PDF
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg">ปิด</button>
          </div>
        </div>
        <div id="receipt-print-area">
          <ReceiptCopy label="ต้นฉบับ" />
          <ReceiptCopy label="สำเนา" />
        </div>
      </div>
    </div>
  )
}