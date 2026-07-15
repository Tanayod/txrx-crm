// วางไฟล์นี้ที่ app/api/upload/route.ts ในโปรเจกต์ Next.js
// จุดประสงค์: เป็นตัวกลางรับไฟล์จากหน้าเว็บ แล้วอัปโหลดขึ้น Google Cloud Storage แทน
// ต้องทำผ่าน backend เท่านั้น เพราะ Service Account Key ห้ามอยู่ฝั่ง browser เด็ดขาด (ใครก็เอาไปใช้ได้ถ้าหลุด)

import { NextRequest, NextResponse } from 'next/server'
import { Storage } from '@google-cloud/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // จำเป็น ต้องใช้ Node.js runtime ไม่ใช่ Edge (Edge ใช้ @google-cloud/storage ไม่ได้)

// อ่าน credentials จาก environment variable (ตั้งใน Vercel) แทนการอ่านไฟล์ตรงๆ
// เพราะ Vercel ไม่มี filesystem ถาวรให้เก็บไฟล์ .json ไว้
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

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string) || 'misc'

    if (!file) {
      return NextResponse.json({ error: 'ไม่พบไฟล์ที่จะอัปโหลด' }, { status: 400 })
    }

    const storage = getStorageClient()
    const bucket = storage.bucket(bucketName)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const destPath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`

    await bucket.file(destPath).save(buffer, {
      resumable: false,
      contentType: file.type || 'application/octet-stream',
    })

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destPath}`

    return NextResponse.json({ url: publicUrl, fileName: file.name })
  } catch (err: any) {
    console.error('อัปโหลดไป GCS ไม่สำเร็จ:', err)
    return NextResponse.json({ error: err?.message || 'อัปโหลดไม่สำเร็จ' }, { status: 500 })
  }
}