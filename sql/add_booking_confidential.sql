-- งานลับ: แอดมินติ๊กตอนจอง → ซ่อนจาก User แพทย์ทุกหน้า (ทีมแพทย์ / รายงานรายวัน / ตรวจพิเศษ) รวมถึงยอดรวม
-- รันใน Supabase Dashboard → SQL Editor ครั้งเดียว (ต้องรันก่อน deploy โค้ดที่ใช้คอลัมน์นี้)

alter table public.bookings
  add column if not exists is_confidential boolean not null default false;
