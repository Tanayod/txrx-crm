// แปลงตัวเลขเป็นคำอ่านภาษาไทยแบบสกุลเงินบาท เช่น 900 -> "เก้าร้อยบาทถ้วน"
const THAI_DIGIT = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า']
const THAI_POSITION = ['','สิบ','ร้อย','พัน','หมื่น','แสน'] // วนซ้ำทุก 6 หลัก แล้วคั่นด้วย "ล้าน"

function convertGroup(numStr: string): string {
  let result = ''
  const len = numStr.length
  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10)
    const position = len - i - 1 // 0 = หลักหน่วย, 1 = หลักสิบ, ...
    if (digit === 0) continue
    if (position === 0 && digit === 1 && len > 1) {
      result += 'เอ็ด'
    } else if (position === 1 && digit === 2) {
      result += 'ยี่สิบ'
    } else if (position === 1 && digit === 1) {
      result += 'สิบ'
    } else {
      result += THAI_DIGIT[digit] + THAI_POSITION[position % 6]
    }
  }
  return result
}

export function numberToThaiBahtText(amount: number): string {
  if (isNaN(amount)) return ''
  const rounded = Math.round(Math.abs(amount) * 100) / 100
  const negative = amount < 0
  const baht = Math.floor(rounded)
  const satang = Math.round((rounded - baht) * 100)

  let bahtText: string
  if (baht === 0) {
    bahtText = 'ศูนย์บาท'
  } else {
    const chunks: string[] = []
    let remaining = baht.toString()
    while (remaining.length > 6) {
      chunks.unshift(remaining.slice(-6))
      remaining = remaining.slice(0, -6)
    }
    chunks.unshift(remaining)
    bahtText = chunks.map((chunk) => convertGroup(chunk)).join('ล้าน') + 'บาท'
  }

  const satangText = satang === 0 ? 'ถ้วน' : convertGroup(satang.toString()) + 'สตางค์'

  return (negative ? 'ลบ' : '') + bahtText + satangText
}