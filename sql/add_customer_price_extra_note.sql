-- เพิ่มช่อง "ราคา/คน" และ "หมายเหตุเพิ่มเติม" ให้ลูกค้า (หน้า /customers)
-- รันใน Supabase Dashboard → SQL Editor ครั้งเดียว

alter table public.customers
  add column if not exists price_per_worker numeric,
  add column if not exists extra_note text;
