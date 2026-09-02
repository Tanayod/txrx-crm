// app/api/flight-check/parse/route.ts
// รับรูปตาราง (base64) -> เรียก Google Gemini (vision) -> คืนแถวข้อมูลที่อ่านได้
// ใช้ REST ตรง ไม่ต้องลง SDK ; ตาม pattern เดียวกับ app/api/upload/route.ts
//
// ค่าใช้จ่าย: ตั้งใจให้ถูกที่สุด — ดีฟอลต์ใช้ gemini-3.5-flash-lite (รุ่นถูกสุดที่อ่านรูปได้ ณ ตอนนี้)
// ถ้าอ่านตัวเลขในตารางพลาด ให้ตั้ง env GEMINI_MODEL=gemini-3.5-flash (แม่นกว่า แพงกว่านิดเดียว)

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'

const PROMPT = `อ่านตารางสรุปยอดงานไฟลท์บิน/MOU จากรูปนี้ แล้วส่งกลับเป็น JSON array
แต่ละสมาชิก = 1 แถวข้อมูลในตาราง คีย์:
  date     : วันที่รูปแบบ YYYY-MM-DD (ถ้าช่องวันที่ว่างเพราะ merge cell ให้ใช้วันที่เดียวกับแถวบน ; ปี พ.ศ. 25xx แปลงเป็น ค.ศ. ก่อน)
  flight   : เที่ยวบิน เช่น "8M-364" — ถ้าช่องว่างเพราะ merge cell กับแถวบน ให้ใส่ค่าเดียวกับแถวบน
  time     : เวลา เช่น "07.50" — ถ้าช่องว่างเพราะ merge cell กับแถวบน ให้ใส่ค่าเดียวกับแถวบน
  company  : ชื่อบริษัท
  namelist : จำนวนตามเนมลิส (ตัวเลข)
  notified : บริษัทแจ้งเข้า (ตัวเลข)
  arrived  : เดินทางเข้า (ตัวเลข)
  note     : หมายเหตุ ("" ถ้าไม่มี)
ข้ามแถวหัวตารางและแถว "รวม"/"total" ; ตัวเลขอ่านไม่ออกให้ใส่ 0`

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      date: { type: 'STRING' },
      flight: { type: 'STRING' },
      time: { type: 'STRING' },
      company: { type: 'STRING' },
      namelist: { type: 'NUMBER' },
      notified: { type: 'NUMBER' },
      arrived: { type: 'NUMBER' },
      note: { type: 'STRING' },
    },
    required: ['date', 'company', 'namelist', 'notified', 'arrived'],
  },
}

type ParsedRow = {
  date: string; flight: string; time: string; company: string
  namelist: number; notified: number; arrived: number; note: string
}

function coerceRows(raw: unknown): ParsedRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r: any) => ({
    date: String(r?.date ?? '').trim(),
    flight: String(r?.flight ?? '').trim(),
    time: String(r?.time ?? '').trim(),
    company: String(r?.company ?? '').trim(),
    namelist: Number(r?.namelist) || 0,
    notified: Number(r?.notified) || 0,
    arrived: Number(r?.arrived) || 0,
    note: String(r?.note ?? '').trim(),
  }))
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY — อ่านรูปไม่ได้ (ใช้วิธี “วางข้อมูล” หรืออัปไฟล์ .xlsx/.csv แทนได้)' },
        { status: 400 }
      )
    }

    const { imageBase64, mediaType } = await req.json()
    if (!imageBase64) {
      return NextResponse.json({ error: 'ไม่พบรูปภาพ' }, { status: 400 })
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mediaType || 'image/png', data: imageBase64 } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      console.error('Gemini error:', geminiRes.status, detail)
      const msg = geminiRes.status === 429
        ? 'Gemini เต็มโควตาชั่วคราว (เกิน rate limit ของ free tier) — รอสักครู่แล้วลองใหม่'
        : `เรียก Gemini ไม่สำเร็จ (${geminiRes.status})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const data = await geminiRes.json()
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ?? ''

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\[[\s\S]*\]/)
      if (!m) return NextResponse.json({ error: 'อ่านผลลัพธ์จาก Gemini ไม่ได้ (ไม่ใช่ JSON)' }, { status: 502 })
      parsed = JSON.parse(m[0])
    }

    return NextResponse.json({ rows: coerceRows(parsed) })
  } catch (err: any) {
    console.error('parse route error:', err)
    return NextResponse.json({ error: err?.message || 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
