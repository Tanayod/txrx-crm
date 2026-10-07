import ExcelJS from 'exceljs'

// ตัวสร้างไฟล์ Excel แบบมีเส้นตาราง/หัวสี ใช้ร่วมกันได้หลายหน้า
// แยก buildWorkbook (ไม่แตะ DOM) ออกจาก downloadExcel (สั่งดาวน์โหลดในเบราว์เซอร์) เพื่อให้ทดสอบใน Node ได้

export type ExcelColumn = {
  header: string
  key: string
  width: number
  align?: 'left' | 'center' | 'right'
  format?: 'date' | 'int' | 'baht' | 'percent'
}

export type ExcelSheet = {
  name: string
  title?: string
  subtitle?: string
  columns: ExcelColumn[]
  rows: Record<string, any>[]
  totals?: Record<string, any>
  // คืนสี ARGB (เช่น 'FFFEE2E2') เพื่อไฮไลต์ทั้งแถว ถ้าไม่ต้องการคืน undefined
  rowFill?: (row: Record<string, any>) => string | undefined
}

const NUM_FMT: Record<NonNullable<ExcelColumn['format']>, string> = {
  date: 'dd/mm/yyyy',
  int: '#,##0',
  baht: '#,##0.00',
  percent: '0.0%',
}

const thinGrey = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
const allBorder = { top: thinGrey, left: thinGrey, bottom: thinGrey, right: thinGrey }

// 'YYYY-MM-DD' -> Date แบบ UTC เที่ยงคืน (exceljs แปลง Date เป็น serial ด้วย UTC ถ้าใช้ local ใน +07:00 วันที่จะเลื่อนถอยหลังไป 1 วัน)
const toExcelDate = (v: any) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v
  const [y, m, d] = v.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// ชื่อชีตของ Excel ยาวไม่เกิน 31 ตัวอักษร และห้ามมี \ / ? * [ ] :
const safeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)

export async function buildWorkbook(sheets: ExcelSheet[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Txrx Service'
  wb.created = new Date()

  for (const sheet of sheets) {
    const colCount = sheet.columns.length
    const headerRowNo = sheet.title ? (sheet.subtitle ? 3 : 2) : 1
    const ws = wb.addWorksheet(safeSheetName(sheet.name), { views: [{ state: 'frozen', ySplit: headerRowNo }] })

    // ตั้งความกว้างคอลัมน์ผ่าน ws.columns แต่ไม่ให้ exceljs เขียนหัวตารางเอง เพราะหัวต้องอยู่ใต้แถวชื่อรายงาน
    ws.columns = sheet.columns.map(c => ({ key: c.key, width: c.width }))

    if (sheet.title) {
      ws.mergeCells(1, 1, 1, colCount)
      const t = ws.getCell(1, 1)
      t.value = sheet.title
      t.font = { bold: true, size: 14, color: { argb: 'FF1E1B4B' } }
      t.alignment = { vertical: 'middle', horizontal: 'left' }
      ws.getRow(1).height = 26
    }
    if (sheet.subtitle) {
      ws.mergeCells(2, 1, 2, colCount)
      const s = ws.getCell(2, 1)
      s.value = sheet.subtitle
      s.font = { size: 10, color: { argb: 'FF6B7280' } }
      s.alignment = { vertical: 'middle', horizontal: 'left' }
    }

    const headerRow = ws.getRow(headerRowNo)
    sheet.columns.forEach((c, i) => { headerRow.getCell(i + 1).value = c.header })
    headerRow.height = 22
    headerRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = { bold: true, color: { argb: 'FF78350F' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = allBorder
    })

    const writeRow = (rowNo: number, data: Record<string, any>) => {
      const row = ws.getRow(rowNo)
      sheet.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1)
        const raw = data[c.key]
        cell.value = c.format === 'date' ? toExcelDate(raw) : (raw ?? '')
        if (c.format) cell.numFmt = NUM_FMT[c.format]
        cell.border = allBorder
        cell.alignment = {
          vertical: 'middle',
          horizontal: c.align ?? (c.format && c.format !== 'date' ? 'right' : 'left'),
          wrapText: false,
        }
      })
      return row
    }

    sheet.rows.forEach((data, idx) => {
      const row = writeRow(headerRowNo + 1 + idx, data)
      const fill = sheet.rowFill?.(data) ?? (idx % 2 === 1 ? 'FFF9FAFB' : undefined) // ไม่มีสีเฉพาะ → ลายม้าลายอ่อนๆ
      if (fill) row.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } } })
    })

    if (sheet.totals) {
      const row = writeRow(headerRowNo + 1 + sheet.rows.length, sheet.totals)
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
      })
    }

    ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: colCount } }
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function downloadExcel(fileName: string, sheets: ExcelSheet[]) {
  const buf = await buildWorkbook(sheets)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
