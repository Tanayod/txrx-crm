-- =============================================================
-- Looker Studio — read-only role + reporting views
-- รันทั้งไฟล์นี้ใน Supabase Dashboard → SQL Editor ครั้งเดียว
-- ปลอดภัย: รันซ้ำได้ (idempotent) ไม่กระทบข้อมูลเดิม
-- =============================================================

-- 1) สร้าง user แบบอ่านอย่างเดียว --------------------------------
--    >>> เปลี่ยน 'CHANGE_ME_ตั้งรหัสยาวๆ' เป็นรหัสจริงก่อนรัน <<<
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'looker_ro') then
    create role looker_ro login password 'CHANGE_ME_ตั้งรหัสยาวๆ';
  end if;
end $$;

grant usage on schema public to looker_ro;

-- 2) VIEW: 1 แถว = 1 การจอง (แบนราบ พร้อมใช้ใน Looker) ----------
create or replace view public.v_bookings_report as
select
  b.id                                       as booking_id,
  b.case_number,
  b.booking_date,
  extract(year  from b.booking_date)::int    as booking_year,
  extract(month from b.booking_date)::int    as booking_month,
  to_char(b.booking_date, 'YYYY-MM')         as booking_month_key,
  b.shift,
  b.service_type,
  b.province,
  b.location_name,
  b.nationality,
  c.customer_name,
  coalesce(b.booked_count, 0)                as booked_count,
  coalesce(mc.actual_count, 0)               as actual_count,
  coalesce(mc.cert_count, 0)                 as cert_count,
  coalesce(mc.hold_count, 0)                 as hold_count,
  greatest(coalesce(mc.actual_count,0) - coalesce(mc.cert_count,0) - coalesce(mc.hold_count,0), 0)
                                             as cert_pending,
  mc.cert_status,
  mc.exam_date                               as medical_exam_date,
  mc.cert_deadline,
  coalesce(sp.special_exam_workers, 0)       as special_exam_workers,
  coalesce(sp.special_exam_amount, 0)        as special_exam_amount,
  coalesce(si.sim_count, b.sim_count, 0)     as sim_count,
  coalesce(pay.payment_status, 'ยังไม่ชำระ') as payment_status,
  coalesce(pay.amount_received, 0)           as payment_received,
  coalesce(pay.total_amount, 0)              as payment_total,
  case when b.service_type = 'ไฟล์ทบิน'
       then coalesce(b.meal_price,0) * coalesce(b.meal_count,0)
       else 0 end                            as meal_amount
from public.bookings b
left join public.customers c on c.id = b.customer_id
left join lateral (
  select m.actual_count, m.cert_count, m.hold_count, m.cert_status, m.exam_date, m.cert_deadline
  from public.medical_cases m
  where m.booking_id = b.id
  order by m.exam_date desc nulls last
  limit 1
) mc on true
left join lateral (
  select sum(coalesce(s.total_workers,0)) as special_exam_workers,
         sum(coalesce(s.total_amount,0))  as special_exam_amount
  from public.special_exams s
  where s.booking_id = b.id
) sp on true
left join lateral (
  select sum(coalesce(x.sim_count,0)) as sim_count
  from public.sim_items x
  where x.booking_id = b.id
) si on true
left join lateral (
  select sum(coalesce(p.amount_received,0)) as amount_received,
         sum(coalesce(p.total_amount,0))    as total_amount,
         (array_agg(p.payment_status order by p.paid_at desc nulls last))[1] as payment_status
  from public.payments p
  where p.booking_id = b.id
) pay on true;

-- 3) VIEW: 1 แถว = 1 รายการตรวจพิเศษย่อย (แยกตามชนิดการตรวจ) -----
create or replace view public.v_special_exam_items_report as
select
  it.id                                          as item_id,
  s.id                                           as special_exam_id,
  s.exam_date,
  to_char(s.exam_date, 'YYYY-MM')                as exam_month_key,
  c.customer_name,
  b.case_number,
  s.location_name,
  coalesce(s.total_workers, 0)                   as total_workers,
  it.exam_name,
  coalesce(it.quantity, 0)                       as quantity,
  coalesce(it.price_per_unit, 0)                 as price_per_unit,
  coalesce(it.subtotal, coalesce(it.quantity,0) * coalesce(it.price_per_unit,0)) as subtotal
from public.special_exam_items it
join public.special_exams s on s.id = it.special_exam_id
left join public.customers c on c.id = s.customer_id
left join public.bookings  b on b.id = s.booking_id
where coalesce(it.quantity, 0) > 0;

-- 4) VIEW: 1 แถว = 1 การชำระเงิน --------------------------------
create or replace view public.v_payments_report as
select
  p.id                                          as payment_id,
  p.paid_at,
  to_char(coalesce(p.paid_at::date, b.booking_date), 'YYYY-MM') as pay_month_key,
  b.case_number,
  b.booking_date,
  c.customer_name,
  p.payment_status,
  p.method,
  p.invoice_no,
  p.worker_count,
  p.price_per_worker,
  coalesce(p.total_amount, 0)                    as total_amount,
  coalesce(p.amount_received, 0)                 as amount_received,
  coalesce(p.wht_amount, 0)                      as wht_amount,
  coalesce(p.credit_used, 0)                     as credit_used,
  coalesce(p.credit_deposited, 0)               as credit_deposited,
  p.is_verified
from public.payments p
left join public.bookings  b on b.id = p.booking_id
left join public.customers c on c.id = p.customer_id;

-- 5) ให้ looker_ro อ่านได้เฉพาะ 3 view นี้ (ไม่เห็นตารางดิบ) ----
grant select on public.v_bookings_report           to looker_ro;
grant select on public.v_special_exam_items_report to looker_ro;
grant select on public.v_payments_report           to looker_ro;

-- (ถ้าอยากให้อ่านตารางดิบทั้งหมดด้วย ให้เปิด 2 บรรทัดนี้แทน)
-- grant select on all tables in schema public to looker_ro;
-- alter default privileges in schema public grant select on tables to looker_ro;
