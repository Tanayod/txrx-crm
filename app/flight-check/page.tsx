'use client'

export const dynamic = 'force-dynamic'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import {
  IconFileSpreadsheet, IconClipboard, IconPencil, IconPlus,
  IconTrash, IconArrowLeft, IconDownload, IconPrinter, IconRefresh, IconAlertTriangle,
} from '@tabler/icons-react'
import {
  parseThaiDate, carryForwardDates, totalsOf, rowDiff, effectiveTxrx, syncTxrx, matchToBookings,
  type FlightRow, type ExtraRow, type BookingLite,
} from '@/lib/flightCheck'

type Phase = 'upload' | 'edit' | 'report'

const fmt = (n: number) => n.toLocaleString('th-TH')
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))
const toThaiDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || '-'
}
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`

const toBase64 = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })

const num = (v: any) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0
const isTotalRow = (cells: any[]) => cells.some((c) => /^\s*(รวม|total|sum)\s*$/i.test(String(c ?? '')))

type RawRow = { date: string; flight: string; time: string; company: string; namelist: number; notified: number; arrived: number; note: string }

// อ่านตาราง 2 มิติ (จาก xlsx / paste) -> แถวดิบ
function parseSheet(aoa: any[][]): RawRow[] {
  const headerIdx = aoa.findIndex((r) => r.some((c) => /เนมลิส|เที่ยวบิน|เดินทางเข้า/.test(String(c ?? ''))))
  const header = (headerIdx >= 0 ? aoa[headerIdx] : []).map((c) => String(c ?? ''))
  const find = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h))
    return i >= 0 ? i : fallback
  }
  const ci = {
    date: find(/วันที่/, 0),
    flight: find(/เที่ยวบิน|flight/i, 1),
    time: find(/เวลา|time/i, 2),
    company: find(/^บริษัท$|บริษัท(?!.*แจ้ง)/, 3),
    namelist: find(/เนมลิส/, 4),
    notified: find(/แจ้งเข้า/, 5),
    arrived: find(/เดินทาง/, 6),
    note: find(/หมายเหตุ|note/i, 7),
  }
  const body = headerIdx >= 0 ? aoa.slice(headerIdx + 1) : aoa
  const out: RawRow[] = []
  for (const r of body) {
    if (!r || r.every((c) => String(c ?? '').trim() === '')) continue
    if (isTotalRow(r)) continue
    const company = String(r[ci.company] ?? '').trim()
    const namelist = num(r[ci.namelist])
    const arrived = num(r[ci.arrived])
    if (!company && !namelist && !arrived) continue
    out.push({
      date: parseThaiDate(String(r[ci.date] ?? '')),
      flight: String(r[ci.flight] ?? '').trim(),
      time: String(r[ci.time] ?? '').trim(),
      company,
      namelist,
      notified: num(r[ci.notified]),
      arrived,
      note: String(r[ci.note] ?? '').trim(),
    })
  }
  return out
}

function textToAoa(text: string): any[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')))
}

function buildRows(raw: RawRow[], setIdx: number): FlightRow[] {
  const withMeta: FlightRow[] = raw.map((r) => ({
    id: uid(`s${setIdx}`),
    set: setIdx,
    date: r.date || '',
    flight: r.flight || '',
    time: r.time || '',
    company: r.company || '',
    namelist: Number(r.namelist) || 0,
    notified: Number(r.notified) || 0,
    arrived: Number(r.arrived) || 0,
    txrx: Number(r.arrived) || 0, // ค่าเริ่มต้น = เดินทางเข้า (จะถูกแทนด้วยยอดจาก booking ตอนจับคู่)
    txrxManual: false,
    bookingId: null,
    auto: false,
    note: r.note || '',
  }))
  return carryForwardDates(withMeta)
}

const blankRaw = (): RawRow => ({ date: '', flight: '', time: '', company: '', namelist: 0, notified: 0, arrived: 0, note: '' })
const blankExtra = (): ExtraRow => ({ id: uid('x'), date: '', flight: '', time: '', company: '', arrived: 0, note: 'มีเดินทางเข้าแต่ไม่มีในตาราง' })

export default function FlightCheck() {
  const { user, role, ready, logout } = useAuth('/flight-check')

  const [phase, setPhase] = useState<Phase>('upload')
  const [rows, setRows] = useState<FlightRow[]>([])
  const [setNames, setSetNames] = useState<string[]>([])
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pasteText, setPasteText] = useState('')

  const setCount = setNames.length

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const startSet = setCount
      const newNames: string[] = []
      const collected: FlightRow[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const setIdx = startSet + i + 1
        newNames.push(file.name)

        if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
          const buf = await file.arrayBuffer()
          const wb = XLSX.read(buf, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false })
          collected.push(...buildRows(parseSheet(aoa), setIdx))
        } else if (/^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
          const b64 = await toBase64(file)
          const res = await fetch('/api/flight-check/parse', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ imageBase64: b64, mediaType: file.type || 'image/png' }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error || `อ่านรูป "${file.name}" ไม่สำเร็จ`)
          const norm: RawRow[] = (data.rows || []).map((r: any) => ({
            date: parseThaiDate(String(r.date || '')),
            flight: String(r.flight || ''), time: String(r.time || ''), company: String(r.company || ''),
            namelist: Number(r.namelist) || 0, notified: Number(r.notified) || 0, arrived: Number(r.arrived) || 0,
            note: String(r.note || ''),
          }))
          collected.push(...buildRows(norm, setIdx))
        } else {
          throw new Error(`ไฟล์ "${file.name}" ไม่รองรับ — ใช้รูป (.png .jpg) หรือ .xlsx / .xls / .csv`)
        }
      }

      setRows((prev) => [...prev, ...collected])
      setSetNames((prev) => [...prev, ...newNames])
      setPhase('edit')
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาดระหว่างอ่านไฟล์')
    } finally {
      setBusy(false)
    }
  }

  function addPastedSet() {
    setError('')
    const raw = parseSheet(textToAoa(pasteText))
    if (raw.length === 0) {
      setError('อ่านข้อมูลที่วางไม่ได้ — ลอง copy ทั้งตาราง (รวมหัวตาราง) จาก Excel/Google Sheets มาวางใหม่')
      return
    }
    const setIdx = setCount + 1
    setRows((prev) => [...prev, ...buildRows(raw, setIdx)])
    setSetNames((prev) => [...prev, `วางข้อมูล #${setIdx}`])
    setPasteText('')
    setPhase('edit')
  }

  function startManualSet() {
    setError('')
    const setIdx = setCount + 1
    setRows((prev) => [...prev, ...buildRows([blankRaw()], setIdx)])
    setSetNames((prev) => [...prev, `กรอกเอง #${setIdx}`])
    setPhase('edit')
  }

  function addRow(setIdx: number) {
    setRows((prev) => [...prev, ...buildRows([blankRaw()], setIdx)])
  }

  function updateRow(id: string, patch: Partial<FlightRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        let next = { ...r, ...patch }
        // แก้ arrived แล้วยัง sync ยอด Txrx ให้ถ้าผู้ใช้ไม่ได้แก้เอง
        if ('arrived' in patch) next = syncTxrx(next)
        return next
      })
    )
  }
  function setTxrxManual(id: string, raw: string) {
    const v = raw.trim() === '' ? 0 : Number(raw) || 0
    updateRow(id, { txrx: v, txrxManual: true })
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }
  function resetAll() {
    setRows([]); setSetNames([]); setExtraRows([]); setBookings([]); setUnmatched([]); setError(''); setPasteText(''); setPhase('upload')
  }
  function addUnmatchedToExtras(b: BookingLite) {
    setExtraRows((p) => [...p, {
      id: uid('x'), date: b.booking_date, flight: '', time: '',
      company: b.customer_name, arrived: b.actual_count ?? 0, note: 'มีเดินทางเข้าแต่ไม่มีในตาราง',
    }])
    setUnmatched((p) => p.filter((x) => x.id !== b.id))
  }

  // ---- จับคู่กับ booking ใน Txrx ----
  const [bookings, setBookings] = useState<BookingLite[]>([])
  const [unmatched, setUnmatched] = useState<BookingLite[]>([]) // booking ตรวจแล้วที่จับกับแถวไหนไม่ได้ (รายการช่วย)

  async function computeReport() {
    const dates = rows.map((r) => r.date).filter(Boolean).sort()
    if (dates.length === 0) { setError('ยังไม่มีวันที่ในข้อมูล — กรอกวันที่อย่างน้อย 1 แถว'); return }
    setBusy(true); setError('')
    try {
      const shift = (iso: string, d: number) => {
        const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d)
        return t.toISOString().slice(0, 10)
      }
      const { data, error: qErr } = await supabase
        .from('bookings')
        .select('id, booking_date, exam_time, booked_count, customers(customer_name), medical_cases(actual_count)')
        .gte('booking_date', shift(dates[0], -5))
        .lte('booking_date', shift(dates[dates.length - 1], 10))
        .order('booking_date', { ascending: true })
      if (qErr) throw qErr
      const getMc = (b: any) => (Array.isArray(b.medical_cases) ? b.medical_cases[0] : b.medical_cases)
      const lite: BookingLite[] = (data || []).map((b: any) => ({
        id: b.id,
        booking_date: b.booking_date,
        exam_time: b.exam_time ?? null,
        booked_count: b.booked_count ?? null,
        actual_count: getMc(b)?.actual_count ?? null,
        customer_name: b.customers?.customer_name ?? '(ไม่มีชื่อ)',
      }))
      setBookings(lite)
      const { rows: matched, suggestedExtras } = matchToBookings(rows, lite)
      setRows(matched)
      // ไม่เติม "รายการพิเศษ" อัตโนมัติ (เดาไม่แม่น) — เก็บไว้เป็นรายการช่วยให้เลือกเพิ่มเอง
      setUnmatched(suggestedExtras)
      setPhase('report')
    } catch (e: any) {
      setError(e?.message || 'ดึงข้อมูล bookings ไม่สำเร็จ — แสดงผลโดยยอด Txrx = เดินทางเข้า')
      setPhase('report')
    } finally {
      setBusy(false)
    }
  }

  function rematch(nextRows: FlightRow[]) {
    const { rows: matched } = matchToBookings(nextRows, bookings)
    setRows(matched)
  }
  function relink(id: string, bookingId: string) {
    rematch(rows.map((r) => (r.id === id ? { ...r, bookingId: bookingId || null, auto: false, txrxManual: false } : r)))
  }
  function revertTxrx(id: string) {
    rematch(rows.map((r) => (r.id === id ? { ...r, txrxManual: false } : r)))
  }

  // ---- extras (กรอกเอง) ----
  function addExtra() { setExtraRows((p) => [...p, blankExtra()]) }
  function updateExtra(id: string, patch: Partial<ExtraRow>) {
    setExtraRows((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }
  function removeExtra(id: string) { setExtraRows((p) => p.filter((e) => e.id !== id)) }

  const sets = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.set))).sort((a, b) => a - b)
    return ids.map((sid) => ({ sid, rows: rows.filter((r) => r.set === sid) }))
  }, [rows])

  // booking ที่วันใกล้ ๆ แถวนี้ (±3 วัน) สำหรับ dropdown จับคู่เอง
  const bookingsByDate = (date: string): BookingLite[] => {
    if (!date) return bookings
    const t = Date.parse(date + 'T00:00:00Z')
    return bookings
      .filter((b) => {
        const bt = Date.parse(b.booking_date + 'T00:00:00Z')
        return !Number.isNaN(bt) && Math.abs(bt - t) <= 3 * 86400000
      })
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date))
  }

  const grand = useMemo(() => totalsOf(rows), [rows])
  const extraArrived = useMemo(() => extraRows.reduce((s, e) => s + (Number(e.arrived) || 0), 0), [extraRows])

  const dateRange = useMemo(() => {
    const ds = rows.map((r) => r.date).filter(Boolean).sort()
    if (!ds.length) return ''
    return `${toThaiDate(ds[0])} – ${toThaiDate(ds[ds.length - 1])}`
  }, [rows])

  function exportExcel() {
    const COLS = ['วันที่', 'เที่ยวบิน', 'เวลา', 'บริษัท', 'จำนวนตามเนมลิส', 'บริษัทแจ้งเข้า', 'เดินทางเข้า', 'ตรวจ Txrx', 'Diff', 'หมายเหตุ']
    const blank = () => Object.fromEntries(COLS.map((c) => [c, ''])) as Record<string, any>
    const data: Record<string, any>[] = []
    data.push({ ...blank(), 'วันที่': `สรุปรายละเอียดข้อมูล MOU และการตรวจสุขภาพ (Txrx)  ${dateRange}` })
    data.push(blank())

    for (const { sid, rows: srows } of sets) {
      data.push({ ...blank(), 'วันที่': `ตารางชุดที่ ${sid}` })
      for (const r of srows) {
        data.push({
          'วันที่': toThaiDate(r.date), 'เที่ยวบิน': r.flight, 'เวลา': r.time, 'บริษัท': r.company,
          'จำนวนตามเนมลิส': r.namelist, 'บริษัทแจ้งเข้า': r.notified, 'เดินทางเข้า': r.arrived,
          'ตรวจ Txrx': effectiveTxrx(r), 'Diff': rowDiff(r) || '', 'หมายเหตุ': r.note,
        })
      }
      const st = totalsOf(srows)
      data.push({
        ...blank(), 'บริษัท': `รวมตารางชุดที่ ${sid}`,
        'จำนวนตามเนมลิส': st.namelist, 'บริษัทแจ้งเข้า': st.notified, 'เดินทางเข้า': st.arrived,
        'ตรวจ Txrx': st.txrx, 'Diff': st.diff,
      })
      data.push(blank())
    }

    if (extraRows.length) {
      data.push({ ...blank(), 'วันที่': 'รายการพิเศษนอกตาราง (มีเดินทางเข้าแต่ไม่มีในตาราง)' })
      for (const e of extraRows) {
        data.push({
          ...blank(), 'วันที่': toThaiDate(e.date), 'เที่ยวบิน': e.flight, 'เวลา': e.time,
          'บริษัท': e.company, 'เดินทางเข้า': e.arrived, 'หมายเหตุ': e.note,
        })
      }
      data.push({ ...blank(), 'บริษัท': 'รวมรายการพิเศษ', 'เดินทางเข้า': extraArrived })
    }

    const ws = XLSX.utils.json_to_sheet(data, { header: COLS })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'รายงานการเดินทางเข้า')
    XLSX.writeFile(wb, `flight_check_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (!ready)
    return <div className="min-h-screen bg-[#F6F7FB] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex min-h-screen bg-[#F6F7FB]">
      <style>{`@media print {
        .no-print { display: none !important; }
        .print-area { margin: 0 !important; padding: 0 !important; }
        @page { size: A4 landscape; margin: 10mm; }
      }`}</style>

      <div className="no-print">
        <Sidebar user={user} role={role} currentPath="/flight-check" onLogout={logout} />
      </div>

      <div className="flex-1 ml-56 p-6 print-area">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 no-print">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">เช็คไฟลท์บิน (MOU)</h1>
            <p className="text-xs text-gray-400">วางข้อมูล / อัปไฟล์ / รูป → ตรวจแก้ → สรุปผลแบบรายงาน Txrx</p>
          </div>
          <div className="flex items-center gap-2">
            {phase === 'report' && (
              <>
                <button onClick={exportExcel} className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                  <IconDownload size={15} /> โหลด Excel
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                  <IconPrinter size={15} /> พิมพ์ / PDF
                </button>
                <button onClick={() => setPhase('edit')} className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                  <IconArrowLeft size={15} /> แก้ข้อมูล
                </button>
              </>
            )}
            {(phase === 'edit' || phase === 'report') && (
              <button onClick={resetAll} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 px-2 py-1.5">
                <IconRefresh size={15} /> เริ่มใหม่
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 no-print">
            <IconAlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ---------- UPLOAD ---------- */}
        {phase === 'upload' && (
          <div className="no-print grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 md:col-span-2">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
                <IconClipboard size={15} /> วางข้อมูลจากตาราง <span className="text-xs text-emerald-600 font-normal">แนะนำ</span>
              </p>
              <p className="text-xs text-gray-400 mb-2">
                เปิดไฟล์ที่นายจ้างส่งใน Excel/Google Sheets → ลากคลุมทั้งตาราง (รวมหัวตาราง) → Ctrl/⌘+C → วางในช่องนี้ → 1 การวาง = 1 ชุด
              </p>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
                placeholder="วันที่&#9;เที่ยวบิน&#9;เวลา&#9;บริษัท&#9;เนมลิสต์&#9;แจ้งเข้า&#9;เดินทางเข้า&#9;หมายเหตุ&#10;04.08.2026&#9;8M-364&#9;07.50&#9;พนัสโพลทรี่&#9;41&#9;41&#9;41"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4338CA]" />
              <div className="flex justify-end mt-2">
                <button onClick={addPastedSet} disabled={!pasteText.trim()}
                  className="bg-[#4338CA] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#3730A3] disabled:opacity-40">อ่านข้อมูล</button>
              </div>
            </div>

            <label className={`bg-white border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#4338CA] transition-colors flex flex-col items-center justify-center ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
              <input type="file" multiple accept="image/*,.xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              <IconFileSpreadsheet size={26} className="text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700">{busy ? 'กำลังอ่าน…' : 'อัปไฟล์ Excel / CSV หรือรูปตาราง'}</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx .xls .csv .png .jpg — 1 ไฟล์ = 1 ชุด</p>
              <p className="text-[11px] text-gray-400 mt-1">รูปใช้ Gemini อ่าน — ต้องตั้ง <code className="bg-gray-100 px-1 rounded">GEMINI_API_KEY</code></p>
            </label>

            <button onClick={startManualSet}
              className="bg-white border border-gray-200 rounded-xl p-6 text-center hover:border-[#4338CA] transition-colors flex flex-col items-center justify-center">
              <IconPencil size={26} className="text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700">กรอกเอง</p>
              <p className="text-xs text-gray-400 mt-1">เปิดตารางเปล่า พิมพ์ทีละแถวจากรูป</p>
            </button>
          </div>
        )}

        {/* ---------- EDIT GRID ---------- */}
        {phase === 'edit' && (
          <div className="no-print space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                ตรวจ/แก้ข้อมูล ({rows.length} แถว / {setCount} ชุด) — ยอด <b>ตรวจ Txrx</b> ตั้งต้น = เดินทางเข้า แก้เฉพาะแถวที่ต่างในหน้าสรุป
              </p>
              <div className="flex gap-3 items-center">
                <button onClick={() => setPhase('upload')} className="text-sm text-[#4338CA] hover:underline">+ เพิ่มชุด</button>
                <label className="text-sm text-[#4338CA] hover:underline cursor-pointer">
                  <input type="file" multiple accept="image/*,.xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                  + เพิ่มไฟล์/รูป
                </label>
                <button onClick={computeReport} disabled={busy}
                  className="bg-[#4338CA] text-white text-sm rounded-lg px-4 py-1.5 hover:bg-[#3730A3] disabled:opacity-50">
                  {busy ? 'กำลังเทียบกับ Txrx…' : 'เทียบกับ Txrx → ดูสรุปผล'}
                </button>
              </div>
            </div>

            {sets.map(({ sid, rows: srows }) => (
              <div key={sid} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-700">
                  ชุดที่ {sid} <span className="text-gray-400 font-normal">— {setNames[sid - 1]}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="px-2 py-2 text-left font-medium">วันที่</th>
                        <th className="px-2 py-2 text-left font-medium">เที่ยวบิน</th>
                        <th className="px-2 py-2 text-left font-medium">เวลา</th>
                        <th className="px-2 py-2 text-left font-medium">บริษัท</th>
                        <th className="px-2 py-2 text-right font-medium">เนมลิสต์</th>
                        <th className="px-2 py-2 text-right font-medium">แจ้งเข้า</th>
                        <th className="px-2 py-2 text-right font-medium">เดินทางเข้า</th>
                        <th className="px-2 py-2 text-left font-medium">หมายเหตุ</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {srows.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50">
                          <td className="px-2 py-1"><input type="date" value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })} className="border border-gray-200 rounded px-1.5 py-1 text-xs w-32" /></td>
                          <td className="px-2 py-1"><input value={r.flight} onChange={(e) => updateRow(r.id, { flight: e.target.value })} className="border border-gray-200 rounded px-1.5 py-1 text-xs w-20" /></td>
                          <td className="px-2 py-1"><input value={r.time} onChange={(e) => updateRow(r.id, { time: e.target.value })} className="border border-gray-200 rounded px-1.5 py-1 text-xs w-16" /></td>
                          <td className="px-2 py-1"><input value={r.company} onChange={(e) => updateRow(r.id, { company: e.target.value })} className="border border-gray-200 rounded px-1.5 py-1 text-xs w-40" /></td>
                          {(['namelist', 'notified', 'arrived'] as const).map((f) => (
                            <td key={f} className="px-2 py-1 text-right">
                              <input type="number" value={r[f]} onChange={(e) => updateRow(r.id, { [f]: Number(e.target.value) || 0 })}
                                className="border border-gray-200 rounded px-1.5 py-1 text-xs w-16 text-right" />
                            </td>
                          ))}
                          <td className="px-2 py-1"><input value={r.note} onChange={(e) => updateRow(r.id, { note: e.target.value })} className="border border-gray-200 rounded px-1.5 py-1 text-xs w-40" /></td>
                          <td className="px-2 py-1"><button onClick={() => removeRow(r.id)} className="text-gray-300 hover:text-red-500"><IconTrash size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 border-t border-gray-100">
                  <button onClick={() => addRow(sid)} className="text-xs text-[#4338CA] hover:underline flex items-center gap-1"><IconPlus size={13} /> เพิ่มแถว</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------- REPORT ---------- */}
        {phase === 'report' && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
            <div className="text-center border-b-2 border-[#4338CA] pb-3 mb-4">
              <h2 className="text-xl font-bold text-gray-800">สรุปรายละเอียดข้อมูล MOU และการตรวจสุขภาพ (Txrx)</h2>
              {dateRange && <p className="text-sm text-[#4338CA] mt-1">ประจำวันที่ {dateRange}</p>}
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">เนมลิสต์รวม</p>
                <p className="text-xl font-bold text-gray-700">{fmt(grand.namelist)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">แจ้งเข้า / เดินทางเข้า</p>
                <p className="text-xl font-bold text-gray-700">{fmt(grand.notified)} / {fmt(grand.arrived)}</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-center">
                <p className="text-xs text-sky-500 mb-1">ตรวจ Txrx จริงรวม</p>
                <p className="text-xl font-bold text-sky-600">{fmt(grand.txrx)}</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${grand.under === 0 ? 'border-gray-100 bg-gray-50' : 'border-red-100 bg-red-50'}`}>
                <p className={`text-xs mb-1 ${grand.under === 0 ? 'text-gray-400' : 'text-red-400'}`}>ขาดตรวจ</p>
                <p className={`text-xl font-bold ${grand.under === 0 ? 'text-gray-500' : 'text-red-500'}`}>{fmt(grand.under)}</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${grand.over === 0 ? 'border-gray-100 bg-gray-50' : 'border-amber-100 bg-amber-50'}`}>
                <p className={`text-xs mb-1 ${grand.over === 0 ? 'text-gray-400' : 'text-amber-500'}`}>ตรวจเกิน</p>
                <p className={`text-xl font-bold ${grand.over === 0 ? 'text-gray-500' : 'text-amber-600'}`}>{signed(grand.over)}</p>
              </div>
            </div>

            {/* ตารางแต่ละชุด */}
            {sets.map(({ sid, rows: srows }) => {
              const st = totalsOf(srows)
              return (
                <div key={sid} className="mb-6">
                  <p className="text-sm font-semibold text-gray-700 border-l-4 border-[#4338CA] pl-2 mb-2">ตารางชุดที่ {sid}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200">
                      <thead>
                        <tr className="bg-[#1E293B] text-white text-xs">
                          <th className="px-2 py-2 text-left font-medium">วันที่</th>
                          <th className="px-2 py-2 text-left font-medium">เที่ยวบิน</th>
                          <th className="px-2 py-2 text-left font-medium">เวลา</th>
                          <th className="px-2 py-2 text-left font-medium">บริษัท</th>
                          <th className="px-2 py-2 text-right font-medium">เนมลิสต์</th>
                          <th className="px-2 py-2 text-right font-medium">แจ้งเข้า</th>
                          <th className="px-2 py-2 text-right font-medium">เดินทาง</th>
                          <th className="px-2 py-2 text-right font-medium">ตรวจ Txrx</th>
                          <th className="px-2 py-2 text-right font-medium">Diff</th>
                          <th className="px-2 py-2 text-left font-medium no-print">จับคู่ Txrx</th>
                          <th className="px-2 py-2 text-left font-medium">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {srows.map((r) => {
                          const d = rowDiff(r)
                          const cands = bookingsByDate(r.date)
                          return (
                            <tr key={r.id} className={`border-b border-gray-100 ${d !== 0 ? 'bg-red-50' : ''}`}>
                              <td className="px-2 py-1.5 whitespace-nowrap">{toThaiDate(r.date)}</td>
                              <td className="px-2 py-1.5">{r.flight}</td>
                              <td className="px-2 py-1.5">{r.time}</td>
                              <td className="px-2 py-1.5">{r.company}</td>
                              <td className="px-2 py-1.5 text-right">{fmt(r.namelist)}</td>
                              <td className="px-2 py-1.5 text-right">{fmt(r.notified)}</td>
                              <td className="px-2 py-1.5 text-right">{fmt(r.arrived)}</td>
                              <td className="px-2 py-1.5 text-right font-medium">
                                <input type="number" value={r.txrx ?? ''} onChange={(e) => setTxrxManual(r.id, e.target.value)}
                                  className={`no-print w-16 text-right border rounded px-1 py-0.5 text-xs ${r.txrxManual ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`} />
                                <span className="hidden print:inline">{fmt(effectiveTxrx(r))}</span>
                                {(r.txrxManual || r.bookingId) && (
                                  <button onClick={() => revertTxrx(r.id)} title="ใช้ = เดินทางเข้า" className="no-print ml-1 text-[10px] text-gray-400 hover:text-[#4338CA]">↺</button>
                                )}
                              </td>
                              <td className={`px-2 py-1.5 text-right font-medium ${d !== 0 ? 'text-red-600' : 'text-gray-300'}`}>{d === 0 ? '' : signed(d)}</td>
                              <td className="px-2 py-1.5 no-print">
                                <select value={r.bookingId ?? ''} onChange={(e) => relink(r.id, e.target.value)}
                                  className="border border-gray-200 rounded px-1 py-1 text-xs max-w-[190px]">
                                  <option value="">— ไม่ผูก —</option>
                                  {cands.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.customer_name} · จอง {b.booked_count ?? '-'} · ตรวจ {b.actual_count ?? '-'}
                                    </option>
                                  ))}
                                </select>
                                {r.auto && r.bookingId && <span className="ml-1 text-[10px] text-emerald-500">auto</span>}
                              </td>
                              <td className="px-2 py-1.5">
                                <input value={r.note} onChange={(e) => updateRow(r.id, { note: e.target.value })}
                                  className="no-print w-full min-w-[150px] border border-gray-200 rounded px-1 py-0.5 text-xs" />
                                <span className="hidden print:inline">{r.note}</span>
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-orange-50 font-semibold text-gray-700">
                          <td className="px-2 py-2" colSpan={4}>รวมตารางชุดที่ {sid}</td>
                          <td className="px-2 py-2 text-right">{fmt(st.namelist)}</td>
                          <td className="px-2 py-2 text-right">{fmt(st.notified)}</td>
                          <td className="px-2 py-2 text-right">{fmt(st.arrived)}</td>
                          <td className="px-2 py-2 text-right">{fmt(st.txrx)}</td>
                          <td className={`px-2 py-2 text-right ${st.diff === 0 ? '' : 'text-red-600'}`}>Diff {signed(st.diff)}</td>
                          <td className="px-2 py-2 no-print" />
                          <td className="px-2 py-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}

            {/* รายการพิเศษนอกตาราง (กรอกเอง) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700 border-l-4 border-amber-500 pl-2">
                  รายการพิเศษนอกตาราง <span className="font-normal text-gray-400">(มีเดินทางเข้าแต่ไม่มีในตารางนายจ้าง)</span>
                </p>
                <button onClick={addExtra} className="no-print text-xs text-[#4338CA] hover:underline flex items-center gap-1"><IconPlus size={13} /> เพิ่มแถว</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200">
                  <thead>
                    <tr className="bg-[#1E293B] text-white text-xs">
                      <th className="px-2 py-2 text-left font-medium">วันที่</th>
                      <th className="px-2 py-2 text-left font-medium">เที่ยวบิน</th>
                      <th className="px-2 py-2 text-left font-medium">เวลา</th>
                      <th className="px-2 py-2 text-left font-medium">บริษัท</th>
                      <th className="px-2 py-2 text-right font-medium">เดินทางเข้า</th>
                      <th className="px-2 py-2 text-left font-medium">หมายเหตุพิเศษ</th>
                      <th className="px-2 py-2 no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {extraRows.length === 0 && (
                      <tr><td colSpan={7} className="px-2 py-3 text-center text-xs text-gray-400">— ยังไม่มี — กด “เพิ่มแถว” เพื่อบันทึกบริษัทที่เดินทางเข้าแต่ไม่อยู่ในตาราง —</td></tr>
                    )}
                    {extraRows.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100">
                        <td className="px-2 py-1.5"><input type="date" value={e.date} onChange={(ev) => updateExtra(e.id, { date: ev.target.value })} className="no-print border border-gray-200 rounded px-1 py-0.5 text-xs w-32" /><span className="hidden print:inline">{toThaiDate(e.date)}</span></td>
                        <td className="px-2 py-1.5"><input value={e.flight} onChange={(ev) => updateExtra(e.id, { flight: ev.target.value })} className="no-print border border-gray-200 rounded px-1 py-0.5 text-xs w-20" /><span className="hidden print:inline">{e.flight}</span></td>
                        <td className="px-2 py-1.5"><input value={e.time} onChange={(ev) => updateExtra(e.id, { time: ev.target.value })} placeholder="10.30 - 12.20" className="no-print border border-gray-200 rounded px-1 py-0.5 text-xs w-28" /><span className="hidden print:inline">{e.time}</span></td>
                        <td className="px-2 py-1.5"><input value={e.company} onChange={(ev) => updateExtra(e.id, { company: ev.target.value })} className="no-print border border-gray-200 rounded px-1 py-0.5 text-xs w-56" /><span className="hidden print:inline">{e.company}</span></td>
                        <td className="px-2 py-1.5 text-right"><input type="number" value={e.arrived} onChange={(ev) => updateExtra(e.id, { arrived: Number(ev.target.value) || 0 })} className="no-print border border-gray-200 rounded px-1 py-0.5 text-xs w-16 text-right" /><span className="hidden print:inline">{fmt(e.arrived)}</span></td>
                        <td className="px-2 py-1.5"><input value={e.note} onChange={(ev) => updateExtra(e.id, { note: ev.target.value })} className="no-print w-full min-w-[150px] border border-gray-200 rounded px-1 py-0.5 text-xs" /><span className="hidden print:inline">{e.note}</span></td>
                        <td className="px-2 py-1.5 no-print"><button onClick={() => removeExtra(e.id)} className="text-gray-300 hover:text-red-500"><IconTrash size={14} /></button></td>
                      </tr>
                    ))}
                    {extraRows.length > 0 && (
                      <tr className="bg-amber-50 font-semibold text-gray-700">
                        <td className="px-2 py-2" colSpan={4}>รวมรายการพิเศษ</td>
                        <td className="px-2 py-2 text-right">{fmt(extraArrived)}</td>
                        <td className="px-2 py-2 no-print" colSpan={2} />
                        <td className="px-2 py-2 print:table-cell hidden" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* รายการช่วย: booking ใน Txrx ที่ตรวจแล้วแต่จับกับแถวไหนไม่ได้ */}
              {unmatched.length > 0 && (
                <details className="no-print mt-2 text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-[#4338CA]">
                    booking ใน Txrx ที่ตรวจแล้วแต่ยังไม่ถูกจับคู่ ({unmatched.length}) — กดเพื่อดู/เลือกเพิ่มเป็นรายการพิเศษ
                  </summary>
                  <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50">
                    {unmatched.map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-gray-600">{toThaiDate(b.booking_date)} · {b.customer_name} · ตรวจจริง {b.actual_count ?? '-'} · จอง {b.booked_count ?? '-'}</span>
                        <button onClick={() => addUnmatchedToExtras(b)} className="text-[#4338CA] hover:underline flex items-center gap-1 flex-shrink-0 ml-2">
                          <IconPlus size={12} /> เพิ่ม
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 mt-1">* ส่วนใหญ่คือแถวในตารางที่จับคู่อัตโนมัติไม่ได้ (ชื่อ/วัน/ยอดไม่ตรง) — ผูกเองที่ช่อง “จับคู่ Txrx” ในแถวนั้นดีกว่า ให้เพิ่มเป็นรายการพิเศษเฉพาะที่ “เข้ามาจริงแต่ไม่มีในตาราง” เท่านั้น</p>
                </details>
              )}
            </div>

            {/* สรุปการคำนวณ */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-gray-700">
              <p className="font-semibold mb-1">📌 สรุปยอดรวมและการคำนวณทั้งหมด</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  ยอดตรวจ Txrx รวม ={' '}
                  {sets.map(({ sid, rows: srows }, i) => (
                    <span key={sid}>{i > 0 ? ' + ' : ''}ชุด {sid} ({fmt(totalsOf(srows).txrx)})</span>
                  ))}{' '}= <b>{fmt(grand.txrx)} คน</b>
                </li>
                <li>
                  เทียบกับเดินทางเข้ารวม {fmt(grand.arrived)} คน →{' '}
                  {grand.diff === 0 && grand.under === 0
                    ? 'ตรงกันทุกแถว'
                    : `ขาดตรวจ ${fmt(grand.under)} + ตรวจเกิน ${signed(grand.over)} → สุทธิ ${signed(grand.diff)} คน`}
                </li>
                {rows.filter((r) => rowDiff(r) !== 0).map((r) => (
                  <li key={r.id}>
                    {r.company} ({toThaiDate(r.date)}): เดินทางเข้า {fmt(r.arrived)} → ตรวจจริง {fmt(effectiveTxrx(r))} ({signed(rowDiff(r))}){r.note ? ` — ${r.note}` : ''}
                  </li>
                ))}
                {extraRows.length > 0 && (
                  <li>รายการพิเศษนอกตาราง: เดินทางเข้ามานอกตารางหลักรวม {fmt(extraArrived)} คน ({extraRows.map((e) => `${e.company} ${fmt(e.arrived)}`).join(', ')})</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
