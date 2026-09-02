// lib/flightCheck.ts
// ฟังก์ชัน pure สำหรับหน้า "เช็คไฟลท์บิน"
// - แปลงวันที่ไทย
// - เติมช่องที่ว่างเพราะ merge cell (วันที่ / เที่ยวบิน / เวลา)
// - สรุปยอด + แยก ขาดตรวจ / ตรวจเกิน
// ไม่มี side-effect / ไม่แตะ network — เทสต์ง่าย

export type FlightRow = {
  id: string
  set: number // ชุดที่ (1-based)
  date: string // YYYY-MM-DD
  flight: string
  time: string
  company: string
  namelist: number // จำนวนตามเนมลิส
  notified: number // บริษัทแจ้งเข้า
  arrived: number // เดินทางเข้า
  txrx: number | null // ยอดตรวจ Txrx จริง (holds best-known: จาก booking ที่จับคู่ / พิมพ์เอง / ดีฟอลต์ = arrived)
  txrxManual: boolean // true = ผู้ใช้พิมพ์ยอดเอง (จับคู่ใหม่/แก้ arrived แล้วจะไม่ทับ)
  bookingId: string | null // booking ใน Txrx ที่จับคู่ได้
  auto: boolean // true = จับคู่อัตโนมัติ ; false = จับเอง / ยังไม่จับ
  note: string
}

export type BookingLite = {
  id: string
  booking_date: string
  exam_time: string | null
  booked_count: number | null
  actual_count: number | null // จำนวนตรวจจริง — null = ยังไม่ตรวจ
  customer_name: string
}

// แถวโซน "รายการพิเศษนอกตาราง / เข้ามาแต่ไม่มีในตาราง" — กรอกเอง
export type ExtraRow = {
  id: string
  date: string
  flight: string
  time: string // เป็นช่วงได้ เช่น "10.30 - 12.20"
  company: string
  arrived: number // เดินทางเข้า
  note: string
}

// ---------- วันที่ ----------

/**
 * รับรูปแบบวันที่ที่พบบ่อยจากเอกสารไทย แล้วคืน ISO (YYYY-MM-DD)
 * รองรับ: 04.08.2026 / 4/8/2026 / 04-08-2026 / 2026-08-04 / 04.08.2569 (พ.ศ.) / 04.08.69
 */
export function parseThaiDate(input: string): string {
  const s = (input || '').trim()
  if (!s) return ''

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (!m) return ''
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  let year = parseInt(m[3], 10)

  if (year >= 2500) year -= 543 // พ.ศ. เต็ม -> ค.ศ.
  if (year < 100) year = year + 2500 - 543 // 2 หลัก (พ.ศ.) -> ค.ศ.

  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * เติมช่องที่เว้นว่างเพราะ merge cell ในตารางต้นฉบับ
 * - date: เติมจากแถวบนเสมอ
 * - flight / time: เติมจากแถวบนเฉพาะเมื่อ "วันเดียวกัน" (กลุ่มเที่ยวบินเดียวกันที่ถูก merge)
 */
export function carryForwardDates(rows: FlightRow[]): FlightRow[] {
  let lastDate = ''
  let lastFlight = ''
  let lastTime = ''
  return rows.map((r) => {
    const date = r.date || lastDate
    const sameDate = !!lastDate && date === lastDate
    const flight = r.flight || (sameDate ? lastFlight : '')
    const time = r.time || (sameDate ? lastTime : '')
    lastDate = date
    lastFlight = flight
    lastTime = time
    return { ...r, date, flight, time }
  })
}

// ---------- ยอด Txrx ----------

/** ยอด Txrx ที่ใช้จริงของแถว: txrx (จาก booking / พิมพ์เอง) ถ้าไม่มีก็ = เดินทางเข้า */
export function effectiveTxrx(r: FlightRow): number {
  return r.txrx ?? r.arrived
}

/** เรียกหลังแก้ arrived: ถ้ายังไม่ผูก booking และไม่ได้พิมพ์เอง ให้ txrx ตาม arrived */
export function syncTxrx(r: FlightRow): FlightRow {
  if (r.txrxManual || r.bookingId) return r
  return { ...r, txrx: r.arrived }
}

/** Diff ราย row = ตรวจ Txrx - เดินทางเข้า (0 = ตรงกัน) */
export function rowDiff(r: FlightRow): number {
  return effectiveTxrx(r) - r.arrived
}

// ---------- จับคู่กับ booking ใน Txrx (แบบอนุรักษ์นิยม) ----------

function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/บริษัท|จำกัด|มหาชน|co\.?|ltd\.?|\(.*?\)/g, '')
    .replace(/[\s.\-_"'`]/g, '')
}
function nameSimilar(a: string, b: string): boolean {
  const x = normName(a)
  const y = normName(b)
  if (x.length < 3 || y.length < 3) return false
  return x === y || x.includes(y) || y.includes(x)
}

function daysApart(a: string, b: string): number {
  const ta = Date.parse(a + 'T00:00:00Z')
  const tb = Date.parse(b + 'T00:00:00Z')
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 9999
  return Math.round(Math.abs(ta - tb) / 86400000)
}

export type MatchResult = {
  rows: FlightRow[]
  /** booking ที่ตรวจจริงแล้ว (actual>0) แต่จับกับแถวไหนไม่ได้ = "เข้ามาแต่ไม่มีในตาราง" */
  suggestedExtras: BookingLite[]
}

/**
 * จับคู่ทีละแถวกับ booking โดย "ยอดตรงกัน" เป็นหลัก + วันใกล้กัน (<= 3 วัน) เท่านั้น
 * - จับได้ & มีผลตรวจจริง -> txrx = actual_count (คำนวณ Diff ให้อัตโนมัติ)
 * - จับได้ แต่ยังไม่ตรวจ -> txrx = เดินทางเข้า (Diff 0 ไปก่อน)
 * - จับไม่ได้ -> txrx = เดินทางเข้า (ไม่เดามั่ว)
 * เคารพแถวที่ผู้ใช้พิมพ์ยอดเอง (txrxManual) และที่จับเอง (bookingId && !auto)
 */
export function matchToBookings(input: FlightRow[], bookings: BookingLite[]): MatchResult {
  const rows = carryForwardDates(input)
  const used = new Set<string>()

  // 1) จองสิทธิ์ booking ของแถวที่จับเอง
  rows.forEach((r) => { if (r.bookingId && !r.auto) used.add(r.bookingId) })

  const score = (r: FlightRow, b: BookingLite): number => {
    const dd = daysApart(b.booking_date, r.date)
    if (dd > 3) return -1
    const a = b.actual_count
    const bc = b.booked_count
    const targets = [r.arrived, r.namelist, r.notified].filter((x) => x > 0)
    let s = -1
    if (a != null) {
      // actual_count มีค่า (รวม 0 = "ไม่ได้เข้าตรวจ")
      if (a === r.arrived) s = 100
      else if (targets.includes(a)) s = 90
      else if (targets.some((t) => Math.abs(t - a) <= 2)) s = 60
    }
    if (s < 0 && bc != null && bc > 0 && targets.includes(bc)) s = 50 // ตรงยอดจอง (ยังไม่ตรวจ)
    if (s < 0) return -1
    if (dd === 0) s += 6
    else if (dd === 1) s += 3
    if (nameSimilar(b.customer_name, r.company)) s += 12
    return s
  }

  // 2) assignment แบบ global: เก็บทุกคู่ที่ผ่านเกณฑ์ เรียงคะแนนมาก->น้อย
  //    (คะแนนเท่ากัน -> วันใกล้กันกว่าได้ก่อน) แล้วจับไล่ลงมา กัน row/booking ซ้ำ
  const auto = new Map<string, BookingLite>()
  const candIdx = rows.map((r) => (r.txrxManual || (r.bookingId && !r.auto) ? -1 : 0))
  const pairs: { ri: number; b: BookingLite; sc: number; dd: number }[] = []
  rows.forEach((r, ri) => {
    if (candIdx[ri] < 0) return
    for (const b of bookings) {
      if (used.has(b.id)) continue
      const sc = score(r, b)
      if (sc >= 50) pairs.push({ ri, b, sc, dd: daysApart(b.booking_date, r.date) })
    }
  })
  pairs.sort((p, q) => q.sc - p.sc || p.dd - q.dd)
  const rowTaken = new Set<number>()
  for (const p of pairs) {
    if (rowTaken.has(p.ri) || used.has(p.b.id)) continue
    rowTaken.add(p.ri)
    used.add(p.b.id)
    auto.set(rows[p.ri].id, p.b)
  }

  const outRows = rows.map((r) => {
    if (r.txrxManual) return r
    if (r.bookingId && !r.auto) {
      const b = bookings.find((x) => x.id === r.bookingId)
      return { ...r, txrx: b && b.actual_count != null ? b.actual_count : r.arrived }
    }
    const b = auto.get(r.id)
    if (!b) return { ...r, bookingId: null, auto: false, txrx: r.arrived }
    // มีเรคคอร์ดตรวจ (แม้ = 0) ใช้ค่านั้น ; ยังไม่มี (null) ใช้เดินทางเข้า
    return { ...r, bookingId: b.id, auto: true, txrx: b.actual_count != null ? b.actual_count : r.arrived }
  })

  const dates = outRows.map((r) => r.date).filter(Boolean).sort()
  const lo = dates[0]
  const hi = dates[dates.length - 1]
  const inRange = (d: string) => (!lo || d >= addDays(lo, -2)) && (!hi || d <= addDays(hi, 5))
  const suggestedExtras = bookings.filter(
    (b) => !used.has(b.id) && (b.actual_count ?? 0) > 0 && inRange(b.booking_date)
  )

  return { rows: outRows, suggestedExtras }
}

function addDays(iso: string, n: number): string {
  const t = new Date(iso + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

// ---------- สรุปยอด ----------

export type FlightTotals = {
  namelist: number
  notified: number
  arrived: number
  txrx: number
  under: number // ขาดตรวจ = ผลรวมของ diff ที่ติดลบ (ค่าติดลบ)
  over: number // ตรวจเกิน = ผลรวมของ diff ที่เป็นบวก
  diff: number // สุทธิ = txrx - arrived (= under + over)
}

export function totalsOf(rows: FlightRow[]): FlightTotals {
  const t: FlightTotals = { namelist: 0, notified: 0, arrived: 0, txrx: 0, under: 0, over: 0, diff: 0 }
  for (const r of rows) {
    const tx = effectiveTxrx(r)
    t.namelist += r.namelist || 0
    t.notified += r.notified || 0
    t.arrived += r.arrived || 0
    t.txrx += tx
    const d = tx - (r.arrived || 0)
    if (d < 0) t.under += d
    else if (d > 0) t.over += d
  }
  t.diff = t.txrx - t.arrived
  return t
}
