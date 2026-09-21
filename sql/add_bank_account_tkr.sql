-- เพิ่มบัญชีธนาคารใหม่ให้เลือกตอนบันทึกการชำระเงิน (หน้า /payments)
-- รันใน Supabase Dashboard → SQL Editor ครั้งเดียว

insert into public.bank_accounts (bank_name, account_number, account_name, is_active, sort_order)
values (
  'กสิกรไทย',
  '135-1-53322-2',
  'บจก. ทีเคอาร์โบรกเกอร์เรจ',
  true,
  coalesce((select max(sort_order) from public.bank_accounts), 0) + 1
);
