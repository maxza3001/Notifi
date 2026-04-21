create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  description text
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  req_id text not null unique,
  request_day date not null,
  request_date_text text not null,
  request_time_text text not null,
  timestamp_ms bigint not null,
  first_name text not null,
  last_name text not null,
  full_name text not null,
  agency text not null,
  citizen_id text not null,
  masked_citizen_id text not null,
  status text not null,
  recorder text not null default 'เจ้าหน้าที่',
  note text not null default '-',
  telegram_status text not null default 'Pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists requests_unique_person_per_day
  on public.requests (request_day, first_name, last_name, citizen_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists requests_set_updated_at on public.requests;

create trigger requests_set_updated_at
before update on public.requests
for each row
execute procedure public.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('TELEGRAM_BOT_TOKEN', '', 'Token จาก BotFather'),
  ('TELEGRAM_CHAT_ID', '', 'Chat ID ของกลุ่มหรือบุคคล'),
  ('SEND_FULL_ID', 'FALSE', 'ตั้งเป็น TRUE หากต้องการส่งเลขบัตรเต็มไปใน Telegram'),
  ('APP_TITLE', 'ระบบบำเหน็จค้ำประกัน', 'ชื่อระบบ'),
  ('ENABLE_DASHBOARD', 'TRUE', 'เปิดหรือปิดหน้า Dashboard'),
  ('TG_BTN_RECEIVE_TEXT', '📥 รับเรื่องแล้ว', 'ข้อความปุ่ม Telegram: รับเรื่องแล้ว'),
  ('TG_BTN_RECEIVE_STATUS', 'รับเรื่องแล้ว', 'ค่าสถานะเมื่อกดปุ่มรับเรื่องแล้ว'),
  ('TG_BTN_PENDING_TEXT', '⏳ รอพิจารณา', 'ข้อความปุ่ม Telegram: รอพิจารณา'),
  ('TG_BTN_PENDING_STATUS', 'รอพิจารณา', 'ค่าสถานะเมื่อกดปุ่มรอพิจารณา'),
  ('TG_BTN_APPROVE_TEXT', '✅ อนุมัติแล้ว', 'ข้อความปุ่ม Telegram: อนุมัติแล้ว'),
  ('TG_BTN_APPROVE_STATUS', 'อนุมัติแล้ว', 'ค่าสถานะเมื่อกดปุ่มอนุมัติแล้ว')
on conflict (key) do nothing;
