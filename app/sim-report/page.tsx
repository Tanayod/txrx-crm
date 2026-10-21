'use client'

export const dynamic = 'force-dynamic'
import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../components/useAuth'
import Sidebar from '../components/Sidebar'
import { IconDownload, IconRefresh, IconDeviceSim, IconSearch } from '@tabler/icons-react'
import { downloadExcel, type ExcelColumn } from '@/lib/excelExport'

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const SIM_TYPES = ['ซิมใหม่', 'ต่อโปรโมชั่น']
const LEGACY_PKG = 'ไม่ระบุ'
const n0 = (n: number) => n.toLocaleString()

type SimRow = {
  key: string
  date: string
  year: number
  month: number // 1-12
  case_number: string
  customer: string
  location: string
  service_type: string
  sim_true_status: string
  pkg: string
  type: string
  count: number
  amount: number
}

// เรียงแพ็กเกจตามราคา ส่วน "ไม่ระบุ" (ข้อมูลเก่า) ไว้ท้ายสุด
const sortPkgs = (pkgs: string[]) => [...pkgs].sort((a, b) => {
  const na = Number(a), nb = Number(b)
  if (isNaN(na)) return 1
  if (isNaN(nb)) return -1
  return na - nb
})
const pkgLabel = (p: string) => isNaN(Number(p)) ? p : `฿${p}/ด.`
// ยอดเงิน = ราคาแพ็กเกจ × จำนวนซิม (ข้อมูลเก่าที่ไม่ระบุแพ็กเกจ คิดเป็น ฿200)
const LEGACY_PRICE = 200
const pkgPrice = (p: string) => Number(p) || LEGACY_PRICE
const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export default function SimReport() {
  const { user, role, ready, logout } = useAuth('/sim-report')
  const [rows, setRows] = useState<SimRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0) // 0 = ทั้งปี
  const [search, setSearch] = useState('')

  if (ready && !loaded) { fetchData(); setLoaded(true) }

  async function fetchData() {
    setLoading(true)
    // ซิมแบบใหม่: แยกรายการตามแพ็กเกจ/ประเภทในตาราง sim_items
    let items: any[] = []
    let from = 0
    while (true) {
      const { data } = await supabase.from('sim_items')
        .select('id, booking_id, sim_package, sim_type, sim_count, bookings(booking_date, case_number, location_name, province, service_type, sim_true_status, customers(customer_name))')
        .order('id').range(from, from + 999)
      if (!data || data.length === 0) break
      items = [...items, ...data]
      if (data.length < 1000) break
      from += 1000
    }
    // ข้อมูลเก่า: เก็บจำนวนซิมไว้ที่ bookings.sim_count (ใช้เฉพาะจองที่ยังไม่มี sim_items — ตรงกับการ์ดซิมบน Dashboard)
    let legacy: any[] = []
    from = 0
    while (true) {
      const { data } = await supabase.from('bookings')
        .select('id, booking_date, case_number, location_name, province, service_type, sim_true_status, sim_count, sim_package, customers(customer_name)')
        .gt('sim_count', 0).order('id').range(from, from + 999)
      if (!data || data.length === 0) break
      legacy = [...legacy, ...data]
      if (data.length < 1000) break
      from += 1000
    }
    const withItems = new Set(items.map(i => i.booking_id))

    const toRow = (key: string, b: any, pkg: any, type: any, count: any): SimRow | null => {
      const date = b?.booking_date
      if (!date) return null
      return {
        key, date,
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        case_number: b.case_number || '-',
        customer: b.customers?.customer_name || '-',
        location: b.location_name || b.province || '-',
        service_type: b.service_type || '-',
        sim_true_status: b.sim_true_status || '-',
        pkg: pkg ? String(pkg) : LEGACY_PKG,
        type: type || 'ไม่ระบุ',
        count: Number(count) || 0,
        amount: pkgPrice(pkg ? String(pkg) : LEGACY_PKG) * (Number(count) || 0),
      }
    }
    const all = [
      ...items.map(i => toRow(`i${i.id}`, i.bookings, i.sim_package, i.sim_type, i.sim_count)),
      ...legacy.filter(b => !withItems.has(b.id)).map(b => toRow(`b${b.id}`, b, b.sim_package, null, b.sim_count)),
    ].filter((r): r is SimRow => !!r && r.count > 0)
      .sort((a, b) => b.date.localeCompare(a.date) || a.case_number.localeCompare(b.case_number))

    setRows(all)
    setLoading(false)
  }

  const years = useMemo(() => {
    const set = new Set(rows.map(r => r.year))
    set.add(new Date().getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [rows])
  const pkgs = useMemo(() => sortPkgs([...new Set(rows.map(r => r.pkg))]), [rows])
  const types = useMemo(() => {
    const present = new Set(rows.map(r => r.type))
    return [...SIM_TYPES, ...[...present].filter(t => !SIM_TYPES.includes(t))].filter(t => present.has(t))
  }, [rows])

  // สรุปยอดชุดหนึ่ง: รวม / แยกแพ็กเกจ / แยกประเภท / จำนวนจอง / จำนวนลูกค้า
  const summarize = (list: SimRow[]) => {
    const byPkg: Record<string, number> = {}, byType: Record<string, number> = {}
    let total = 0, amount = 0
    list.forEach(r => {
      total += r.count
      amount += r.amount
      byPkg[r.pkg] = (byPkg[r.pkg] || 0) + r.count
      byType[r.type] = (byType[r.type] || 0) + r.count
    })
    return {
      total, amount, byPkg, byType,
      bookings: new Set(list.map(r => r.case_number)).size,
      customers: new Set(list.map(r => r.customer)).size,
    }
  }

  const yearly = useMemo(() => years.filter(y => rows.some(r => r.year === y)).map(y => ({ year: y, ...summarize(rows.filter(r => r.year === y)) })), [rows, years])
  const yearRows = useMemo(() => rows.filter(r => r.year === year), [rows, year])
  const yearSum = useMemo(() => summarize(yearRows), [yearRows])
  const monthly = useMemo(() => MONTHS.map((_, i) => ({ month: i + 1, ...summarize(yearRows.filter(r => r.month === i + 1)) })), [yearRows])
  const byCustomer = useMemo(() => {
    const scope = month ? yearRows.filter(r => r.month === month) : yearRows
    const map: Record<string, { customer: string, total: number, amount: number, bookings: Set<string>, byPkg: Record<string, number> }> = {}
    scope.forEach(r => {
      const c = map[r.customer] ||= { customer: r.customer, total: 0, amount: 0, bookings: new Set(), byPkg: {} }
      c.total += r.count
      c.amount += r.amount
      c.bookings.add(r.case_number)
      c.byPkg[r.pkg] = (c.byPkg[r.pkg] || 0) + r.count
    })
    return Object.values(map).map(c => ({ ...c, bookingCount: c.bookings.size })).sort((a, b) => b.total - a.total)
  }, [yearRows, month])
  const details = useMemo(() => {
    const q = search.trim().toLowerCase()
    return yearRows.filter(r => (!month || r.month === month) && (!q || r.customer.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q)))
  }, [yearRows, month, search])
  const detailTotal = details.reduce((s, r) => s + r.count, 0)
  const detailAmount = details.reduce((s, r) => s + r.amount, 0)
  const hasLegacy = yearRows.some(r => r.pkg === LEGACY_PKG)

  const exportExcel = async () => {
    const pkgCols: ExcelColumn[] = pkgs.map(p => ({ header: `แพ็กเกจ ${pkgLabel(p)}`, key: `pkg_${p}`, width: 14, format: 'int' }))
    const typeCols: ExcelColumn[] = types.map(t => ({ header: t, key: `type_${t}`, width: 14, format: 'int' }))
    const flat = (s: ReturnType<typeof summarize>) => ({
      ...Object.fromEntries(pkgs.map(p => [`pkg_${p}`, s.byPkg[p] || 0])),
      ...Object.fromEntries(types.map(t => [`type_${t}`, s.byType[t] || 0])),
      bookings: s.bookings, customers: s.customers, total: s.total, amount: s.amount,
    })
    const sumCols: ExcelColumn[] = [
      ...pkgCols, ...typeCols,
      { header: 'จำนวนจอง', key: 'bookings', width: 11, format: 'int' },
      { header: 'จำนวนลูกค้า', key: 'customers', width: 12, format: 'int' },
      { header: 'รวมซิม', key: 'total', width: 11, format: 'int' },
      { header: 'ยอดเงิน (บาท)', key: 'amount', width: 15, format: 'baht' },
    ]
    const monthLabel = month ? `เดือน ${MONTHS[month - 1]} ${year}` : `ทั้งปี ${year}`
    await downloadExcel(`sim_report_${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.xlsx`, [
      {
        name: 'รายปี', title: 'สรุปยอดขายซิม รายปี',
        columns: [{ header: 'ปี', key: 'year', width: 8, align: 'center' }, ...sumCols],
        rows: yearly.map(y => ({ year: y.year, ...flat(y) })),
        totals: { year: 'รวม', ...flat(summarize(rows)) },
      },
      {
        name: `รายเดือน ${year}`, title: `สรุปยอดขายซิม รายเดือน ปี ${year}`,
        columns: [{ header: 'เดือน', key: 'month', width: 10, align: 'center' }, ...sumCols],
        rows: monthly.map(m => ({ month: MONTHS[m.month - 1], ...flat(m) })),
        totals: { month: 'รวม', ...flat(yearSum) },
      },
      {
        name: 'รายลูกค้า', title: `ยอดซิมรายลูกค้า — ${monthLabel}`,
        columns: [
          { header: 'ลูกค้า', key: 'customer', width: 30 },
          ...pkgCols,
          { header: 'จำนวนจอง', key: 'bookings', width: 11, format: 'int' },
          { header: 'รวมซิม', key: 'total', width: 11, format: 'int' },
          { header: 'ยอดเงิน (บาท)', key: 'amount', width: 15, format: 'baht' },
        ],
        rows: byCustomer.map(c => ({ customer: c.customer, ...Object.fromEntries(pkgs.map(p => [`pkg_${p}`, c.byPkg[p] || 0])), bookings: c.bookingCount, total: c.total, amount: c.amount })),
        totals: { customer: `รวม ${byCustomer.length} ลูกค้า`, total: byCustomer.reduce((s, c) => s + c.total, 0), amount: byCustomer.reduce((s, c) => s + c.amount, 0) },
      },
      {
        name: 'รายละเอียด', title: `รายละเอียดการขายซิม — ${monthLabel}`,
        subtitle: search ? `ค้นหา: ${search}` : undefined,
        columns: [
          { header: 'วันที่', key: 'date', width: 12, format: 'date' },
          { header: 'เลขจอง', key: 'case_number', width: 20 },
          { header: 'ลูกค้า', key: 'customer', width: 28 },
          { header: 'สถานที่', key: 'location', width: 24 },
          { header: 'Type', key: 'service_type', width: 16 },
          { header: 'แพ็กเกจ', key: 'pkg', width: 12, align: 'center' },
          { header: 'ประเภท', key: 'type', width: 14 },
          { header: 'จำนวนซิม', key: 'count', width: 10, format: 'int' },
          { header: 'ยอดเงิน (บาท)', key: 'amount', width: 14, format: 'baht' },
          { header: 'สถานะซิมทรู', key: 'sim_true_status', width: 18 },
        ],
        rows: details.map(r => ({ ...r, pkg: pkgLabel(r.pkg) })),
        totals: { customer: `รวม ${details.length} รายการ`, count: detailTotal, amount: detailAmount },
      },
    ])
  }

  if (!ready) return <div className="min-h-screen bg-[#F6F7FB] flex items-center justify-center text-sm text-gray-400">กำลังโหลด...</div>

  const th = 'px-3 py-2 text-xs font-semibold text-gray-500 text-right whitespace-nowrap'
  const td = 'px-3 py-2 text-xs text-right tabular-nums'
  const cell = (v: number) => v > 0 ? n0(v) : <span className="text-gray-300">-</span>

  return (
    <div className="flex min-h-screen bg-[#F6F7FB]">
      <Sidebar user={user} role={role} currentPath="/sim-report" onLogout={logout} />
      <div className="flex-1 ml-56 p-6 min-w-0">
        <div className="flex justify-between items-center mb-5">
          <div>
            <p className="text-base font-semibold text-gray-800 flex items-center gap-2"><IconDeviceSim size={18} className="text-purple-600"/> รายงานยอดขายซิม</p>
            <p className="text-xs text-gray-400 mt-0.5">สรุปรายปี / รายเดือน / รายลูกค้า พร้อมรายละเอียดทุกจอง (นับตามวันที่จอง)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel} disabled={loading} className="border border-gray-200 bg-white text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
              <IconDownload size={15}/> Export Excel
            </button>
            <button onClick={fetchData} className="bg-[#4338CA] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#312E81] flex items-center gap-2">
              <IconRefresh size={15}/> โหลดใหม่
            </button>
          </div>
        </div>

        {/* รายปี */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-4 overflow-x-auto">
          <p className="px-4 pt-3 pb-2 text-sm font-semibold text-gray-700">สรุปรายปี <span className="text-xs font-normal text-gray-400">· คลิกปีเพื่อดูรายเดือน</span></p>
          <table className="w-full">
            <thead className="bg-gray-50 border-y border-gray-100">
              <tr>
                <th className={`${th} text-left`}>ปี</th>
                {pkgs.map(p => <th key={p} className={th}>{pkgLabel(p)}</th>)}
                {types.map(t => <th key={t} className={`${th} text-purple-500`}>{t}</th>)}
                <th className={th}>จำนวนจอง</th>
                <th className={th}>ลูกค้า</th>
                <th className={`${th} text-gray-700`}>รวมซิม</th>
                <th className={`${th} text-emerald-600`}>ยอดเงิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <tr><td colSpan={99} className="text-center text-xs text-gray-400 py-6">กำลังโหลด...</td></tr>}
              {!loading && yearly.length === 0 && <tr><td colSpan={99} className="text-center text-xs text-gray-400 py-6">ยังไม่มีข้อมูลการขายซิม</td></tr>}
              {!loading && yearly.map(y => (
                <tr key={y.year} onClick={() => { setYear(y.year); setMonth(0) }}
                  className={`cursor-pointer hover:bg-indigo-50/50 ${y.year === year ? 'bg-indigo-50' : ''}`}>
                  <td className={`${td} text-left font-semibold ${y.year === year ? 'text-[#4338CA]' : 'text-gray-700'}`}>{y.year}</td>
                  {pkgs.map(p => <td key={p} className={td}>{cell(y.byPkg[p] || 0)}</td>)}
                  {types.map(t => <td key={t} className={`${td} text-purple-600`}>{cell(y.byType[t] || 0)}</td>)}
                  <td className={`${td} text-gray-500`}>{n0(y.bookings)}</td>
                  <td className={`${td} text-gray-500`}>{n0(y.customers)}</td>
                  <td className={`${td} font-bold text-gray-800`}>{n0(y.total)}</td>
                  <td className={`${td} font-bold text-emerald-600`}>{baht(y.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* การ์ดสรุปปีที่เลือก */}
        <div className="flex items-center gap-3 mb-3">
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setMonth(0) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
            {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4338CA]">
            <option value={0}>ทุกเดือน</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          {[
            { label: `ซิมทั้งหมดปี ${year}`, value: yearSum.total, color: 'text-[#4338CA]' },
            { label: `ยอดเงินปี ${year} (ตามราคาแพ็กเกจ)`, value: yearSum.amount, color: 'text-emerald-600', money: true },
            ...types.map(t => ({ label: t, value: yearSum.byType[t] || 0, color: 'text-purple-600' })),
            { label: 'จำนวนจองที่มีซิม', value: yearSum.bookings, color: 'text-gray-700' },
            { label: 'จำนวนลูกค้า', value: yearSum.customers, color: 'text-gray-700' },
          ].map((c, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${c.color}`}>{'money' in c && c.money ? baht(c.value) : n0(c.value)}</p>
            </div>
          ))}
        </div>
        {hasLegacy && <p className="text-[11px] text-amber-600 -mt-2 mb-4">* ซิมแพ็กเกจ &quot;ไม่ระบุ&quot; (ข้อมูลเก่า) คิดยอดเงินที่ ฿{LEGACY_PRICE}/ซิม</p>}

        {/* รายเดือน */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-4 overflow-x-auto">
          <p className="px-4 pt-3 pb-2 text-sm font-semibold text-gray-700">สรุปรายเดือน ปี {year} <span className="text-xs font-normal text-gray-400">· คลิกเดือนเพื่อดูรายละเอียด (คลิกซ้ำ = ทั้งปี)</span></p>
          <table className="w-full">
            <thead className="bg-gray-50 border-y border-gray-100">
              <tr>
                <th className={`${th} text-left`}>เดือน</th>
                {pkgs.map(p => <th key={p} className={th}>{pkgLabel(p)}</th>)}
                {types.map(t => <th key={t} className={`${th} text-purple-500`}>{t}</th>)}
                <th className={th}>จำนวนจอง</th>
                <th className={th}>ลูกค้า</th>
                <th className={`${th} text-gray-700`}>รวมซิม</th>
                <th className={`${th} text-emerald-600`}>ยอดเงิน</th>
                <th className={`${th} w-40`}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthly.map(m => {
                const maxMonth = Math.max(...monthly.map(x => x.total), 1)
                return (
                  <tr key={m.month} onClick={() => setMonth(month === m.month ? 0 : m.month)}
                    className={`cursor-pointer hover:bg-indigo-50/50 ${month === m.month ? 'bg-indigo-50' : ''}`}>
                    <td className={`${td} text-left font-medium ${month === m.month ? 'text-[#4338CA]' : 'text-gray-700'}`}>{MONTHS[m.month - 1]}</td>
                    {pkgs.map(p => <td key={p} className={td}>{cell(m.byPkg[p] || 0)}</td>)}
                    {types.map(t => <td key={t} className={`${td} text-purple-600`}>{cell(m.byType[t] || 0)}</td>)}
                    <td className={`${td} text-gray-500`}>{cell(m.bookings)}</td>
                    <td className={`${td} text-gray-500`}>{cell(m.customers)}</td>
                    <td className={`${td} font-bold text-gray-800`}>{cell(m.total)}</td>
                    <td className={`${td} font-semibold text-emerald-600`}>{m.amount > 0 ? baht(m.amount) : <span className="text-gray-300">-</span>}</td>
                    <td className="px-3 py-2">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(m.total / maxMonth) * 100}%` }}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-800 text-white">
              <tr>
                <td className={`${td} text-left font-bold`}>รวม</td>
                {pkgs.map(p => <td key={p} className={`${td} font-bold`}>{n0(yearSum.byPkg[p] || 0)}</td>)}
                {types.map(t => <td key={t} className={`${td} font-bold`}>{n0(yearSum.byType[t] || 0)}</td>)}
                <td className={`${td} font-bold`}>{n0(yearSum.bookings)}</td>
                <td className={`${td} font-bold`}>{n0(yearSum.customers)}</td>
                <td className={`${td} font-bold`}>{n0(yearSum.total)}</td>
                <td className={`${td} font-bold`}>{baht(yearSum.amount)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* รายลูกค้า */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-sm font-semibold text-gray-700">รายลูกค้า · {month ? `${MONTHS[month - 1]} ${year}` : `ทั้งปี ${year}`}</p>
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-y border-gray-100 sticky top-0">
                  <tr>
                    <th className={`${th} text-left`}>ลูกค้า</th>
                    <th className={th}>จอง</th>
                    <th className={`${th} text-gray-700`}>ซิม</th>
                    <th className={`${th} text-emerald-600`}>ยอดเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byCustomer.length === 0 && <tr><td colSpan={4} className="text-center text-xs text-gray-400 py-6">ไม่มีข้อมูล</td></tr>}
                  {byCustomer.map(c => (
                    <tr key={c.customer} onClick={() => setSearch(search === c.customer ? '' : c.customer)}
                      className={`cursor-pointer hover:bg-indigo-50/50 ${search === c.customer ? 'bg-indigo-50' : ''}`}>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {c.customer}
                        <p className="text-[11px] text-gray-400">{pkgs.filter(p => c.byPkg[p]).map(p => `${pkgLabel(p)}×${c.byPkg[p]}`).join(' · ')}</p>
                      </td>
                      <td className={`${td} text-gray-500`}>{c.bookingCount}</td>
                      <td className={`${td} font-bold text-gray-800`}>{n0(c.total)}</td>
                      <td className={`${td} font-semibold text-emerald-600`}>{baht(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* รายละเอียด */}
          <div className="xl:col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-700">รายละเอียด · {month ? `${MONTHS[month - 1]} ${year}` : `ทั้งปี ${year}`} <span className="text-xs font-normal text-gray-400">({details.length} รายการ · {n0(detailTotal)} ซิม · {baht(detailAmount)})</span></p>
              <div className="relative">
                <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาลูกค้า / เลขจอง"
                  className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-[#4338CA]"/>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-y border-gray-100 sticky top-0">
                  <tr>
                    <th className={`${th} text-left`}>วันที่ / เลขจอง</th>
                    <th className={`${th} text-left`}>ลูกค้า / สถานที่</th>
                    <th className={`${th} text-left`}>Type</th>
                    <th className={`${th} text-left`}>แพ็กเกจ</th>
                    <th className={`${th} text-left`}>ประเภท</th>
                    <th className={th}>จำนวน</th>
                    <th className={`${th} text-emerald-600`}>ยอดเงิน</th>
                    <th className={`${th} text-left`}>สถานะซิมทรู</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {details.length === 0 && <tr><td colSpan={8} className="text-center text-xs text-gray-400 py-6">ไม่มีข้อมูล</td></tr>}
                  {details.map(r => (
                    <tr key={r.key} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{r.date}<p className="text-[11px] text-gray-400 font-mono">{r.case_number}</p></td>
                      <td className="px-3 py-2 text-xs text-gray-700">{r.customer}<p className="text-[11px] text-gray-400">{r.location}</p></td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.service_type}</td>
                      <td className="px-3 py-2 text-xs"><span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md whitespace-nowrap">{pkgLabel(r.pkg)}</span></td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{r.type}</td>
                      <td className={`${td} font-semibold text-gray-800`}>{n0(r.count)}</td>
                      <td className={`${td} text-emerald-600`}>{r.amount > 0 ? baht(r.amount) : <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.sim_true_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
