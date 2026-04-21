import { z } from "zod";

import { dashboardStatusValues } from "@/lib/statuses";

export const createRequestSchema = z.object({
  firstName: z.string().trim().min(1, "กรุณากรอกชื่อ"),
  lastName: z.string().trim().min(1, "กรุณากรอกนามสกุล"),
  citizenId: z.string().trim().regex(/^\d{13}$/, "เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก"),
  agency: z.string().trim().min(1, "กรุณาเลือกส่วนราชการ"),
});

export const updateRequestStatusSchema = z.object({
  status: z.enum(dashboardStatusValues),
  note: z.string().trim().max(500, "หมายเหตุต้องไม่เกิน 500 ตัวอักษร").optional(),
  sendNotification: z.boolean().optional(),
});
