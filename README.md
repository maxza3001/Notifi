# Notification System for Requests

ระบบนี้ถูกย้ายจาก Google Apps Script มาเป็น Next.js + Supabase โดยยังคง logic หลักเดิมไว้:

- บันทึกคำขอใหม่พร้อมตรวจสอบเลขบัตรประชาชน
- ป้องกันการบันทึกซ้ำในวันเดียวกันสำหรับบุคคลเดียวกัน
- ส่ง Telegram notification เมื่อมีคำขอใหม่
- ใช้ inline buttons ใน Telegram เพื่ออัปเดตสถานะจากค่าใน `app_settings`
- อัปเดตสถานะจากหน้า dashboard และเลือกส่งแจ้งเตือน Telegram เพิ่มได้

## Stack

- Next.js App Router
- React 19
- Supabase (Postgres)
- Telegram Bot API

## Setup

1. คัดลอก `.env.example` เป็น `.env.local`
2. ใส่ค่า `NEXT_PUBLIC_SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY`
3. รัน SQL ในไฟล์ `supabase/schema.sql` ผ่าน Supabase SQL editor
4. ใส่ค่า Telegram ในตาราง `app_settings`
5. ติดตั้ง dependency และรัน dev server

```bash
npm install
npm run dev
```

## Important Routes

- `POST /api/requests` สร้างคำขอใหม่
- `GET /api/requests` โหลดรายการคำขอสำหรับ dashboard
- `PATCH /api/requests/:requestId/status` อัปเดตสถานะจาก dashboard
- `POST /api/telegram/webhook` รับ callback จาก Telegram

## Telegram Webhook

หลัง deploy ให้ตั้ง webhook ไปที่:

```text
https://your-domain.example/api/telegram/webhook
```

หรือตั้งผ่านสคริปต์ในโปรเจ็กต์:

```bash
npm run telegram:webhook:info
npm run telegram:webhook:set
```

หมายเหตุ:
- Telegram ต้องใช้ `https` public URL เท่านั้น
- `http://localhost:3000` ใช้เป็น webhook ปลายทางจริงไม่ได้
- ถ้าทดสอบบนเครื่อง ให้ใช้ tunnel เช่น `ngrok` หรือ `cloudflared` แล้วใส่ URL นั้นใน `TELEGRAM_WEBHOOK_URL`

จากนั้นเมื่อผู้ใช้กดปุ่มใน Telegram ระบบจะ:

1. อ่านข้อความปุ่มและค่าสถานะจาก `app_settings`
2. ตอบกลับในแชทให้เร็วที่สุด
3. ค่อยบันทึกสถานะลงตาราง `requests` ตามหลัง

## Notes

- ไฟล์ Google Apps Script เดิม (`Code.gs`, `*.html`) ยังถูกเก็บไว้เป็น reference ใน workspace นี้
- ฝั่ง dashboard ยังคงใช้ชุดสถานะเดิมเหมือนระบบเก่า
