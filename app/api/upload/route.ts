// วางไฟล์นี้ที่ app/api/upload/route.ts (แทนที่ของเดิม)
// เปลี่ยนวิธีทำงาน: แทนที่จะรับไฟล์เข้ามาที่ Vercel แล้วส่งต่อ (ติด limit 4.5MB ของ Vercel)
// เปลี่ยนเป็นสร้าง "signed URL" ให้บราวเซอร์อัปโหลดไฟล์ตรงไปที่ GCS เลย ไม่ผ่าน Vercel

import { NextRequest, NextResponse } from 'next/server'
import { Storage } from '@google-cloud/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getStorageClient() {
  const rawJson = process.env.GCS_SERVICE_ACCOUNT_JSON
  if (!rawJson) throw new Error('ยังไม่ได้ตั้งค่า GCS_SERVICE_ACCOUNT_JSON ใน environment variables')
  const credentials = JSON.parse(rawJson)
  return new Storage({ credentials, projectId: credentials.project_id })
}

export async function POST(req: NextRequest) {
  try {
    const bucketName = process.env.GCS_BUCKET_NAME
    if (!bucketName) {
      return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า GCS_BUCKET_NAME ใน environment variables' }, { status: 500 })
    }

    // รับแค่ข้อมูลเล็กๆ (ชื่อไฟล์ + ประเภทไฟล์) ไม่ใช่ตัวไฟล์จริง เพราะงั้นไม่มีทางติด limit ของ Vercel
    const { fileName, folder, contentType } = await req.json()
    if (!fileName) {
      return NextResponse.json({ error: 'ไม่พบชื่อไฟล์' }, { status: 400 })
    }

    const storage = getStorageClient()
    const bucket = storage.bucket(bucketName)

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
    const destPath = `${folder || 'misc'}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`
    const file = bucket.file(destPath)

    // สร้างลิงก์อัปโหลดชั่วคราว อายุ 15 นาที (ให้บราวเซอร์อัปโหลดไฟล์จริงตรงไปที่นี่เลย)
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType || 'application/octet-stream',
    })

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destPath}`

    return NextResponse.json({ uploadUrl, publicUrl, fileName })
  } catch (err: any) {
    console.error('สร้าง signed URL ไม่สำเร็จ:', err)
    return NextResponse.json({ error: err?.message || 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}