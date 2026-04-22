import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { dashboardStatusValues } from "@/lib/statuses";
import { getSettingsMap, getTelegramActionConfig } from "@/lib/settings";
import { sendTelegramRequestNotification, sendTelegramStatusNotification } from "@/lib/telegram";
import type { CreateRequestInput, RequestRecord, TelegramAction, UpdateRequestStatusInput } from "@/lib/types";
import {
  AppError,
  formatBangkokDay,
  formatBangkokTime,
  formatThaiDate,
  generateRequestId,
  getErrorMessage,
  maskCitizenId,
  normalizeOptionalText,
  sanitizeName,
  validateCitizenId,
} from "@/lib/utils";

function isDuplicateConstraintError(error: { code?: string; message?: string } | null) {
  return error?.code === "23505";
}

type GetRequestsOptions = {
  search?: string;
  status?: string;
};

export async function getRequests(options: GetRequestsOptions = {}): Promise<RequestRecord[]> {
  const supabase = getSupabaseAdminClient();
  const search = sanitizeName(options.search ?? "");
  const status = (options.status ?? "").trim();

  let query = supabase
    .from("requests")
    .select("id, req_id, request_date_text, request_time_text, full_name, agency, masked_citizen_id, status, note, telegram_status, created_at")
    .order("timestamp_ms", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    const escapedSearch = search.replace(/([,%_])/g, "\\$1");
    query = query.or(
      `full_name.ilike.%${escapedSearch}%,agency.ilike.%${escapedSearch}%,masked_citizen_id.ilike.%${escapedSearch}%,req_id.ilike.%${escapedSearch}%`,
    );
  }

  const { data, error } = await query;

  if (error) throw new AppError(`โหลดข้อมูลล้มเหลว: ${error.message}`, 500);

  return (data ?? []).map((row) => ({
    id: row.id,
    reqId: row.req_id,
    requestDate: row.request_date_text,
    requestTime: row.request_time_text,
    fullName: row.full_name,
    agency: row.agency,
    maskedCitizenId: row.masked_citizen_id,
    status: row.status,
    note: row.note ?? "-",
    telegramStatus: row.telegram_status ?? "-",
    createdAt: row.created_at,
  }));
}

async function buildInsertPayload(input: CreateRequestInput) {
  const now = new Date();
  const firstName = sanitizeName(input.firstName);
  const lastName = sanitizeName(input.lastName);
  const citizenId = input.citizenId.trim();
  const agency = input.agency.trim();

  if (!firstName || !lastName || !agency) {
    throw new AppError("กรุณากรอกข้อมูลให้ครบถ้วน");
  }

  if (!validateCitizenId(citizenId)) {
    throw new AppError("เลขประจำตัวประชาชนไม่ถูกต้อง");
  }

  return {
    now,
    firstName,
    lastName,
    citizenId,
    agency,
    fullName: `${firstName} ${lastName}`,
    maskedCitizenId: maskCitizenId(citizenId),
    requestDay: formatBangkokDay(now),
    requestDateText: formatThaiDate(now),
    requestTimeText: formatBangkokTime(now),
    timestampMs: now.getTime(),
    status: "รออนุมัติ",
  };
}

export async function createRequest(input: CreateRequestInput) {
  const payload = await buildInsertPayload(input);
  const supabase = getSupabaseAdminClient();

  const { data: duplicateRow, error: duplicateError } = await supabase
    .from("requests")
    .select("id")
    .eq("request_day", payload.requestDay)
    .eq("first_name", payload.firstName)
    .eq("last_name", payload.lastName)
    .eq("citizen_id", payload.citizenId)
    .maybeSingle();

  if (duplicateError && duplicateError.code !== "PGRST116") {
    throw new AppError(`ตรวจสอบข้อมูลซ้ำล้มเหลว: ${duplicateError.message}`, 500);
  }

  if (duplicateRow) {
    throw new AppError("ตรวจพบการบันทึกข้อมูลซ้ำซ้อนในวันนี้ สำหรับบุคคลนี้");
  }

  let reqId = "";
  let lastInsertError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    reqId = generateRequestId(payload.now, attempt);

    const { error } = await supabase.from("requests").insert({
      req_id: reqId,
      request_day: payload.requestDay,
      request_date_text: payload.requestDateText,
      request_time_text: payload.requestTimeText,
      timestamp_ms: payload.timestampMs,
      first_name: payload.firstName,
      last_name: payload.lastName,
      full_name: payload.fullName,
      agency: payload.agency,
      citizen_id: payload.citizenId,
      masked_citizen_id: payload.maskedCitizenId,
      status: payload.status,
      recorder: "เจ้าหน้าที่",
      note: "-",
      telegram_status: "Pending",
    });

    if (!error) {
      lastInsertError = null;
      break;
    }

    if (isDuplicateConstraintError(error)) {
      lastInsertError = error;
      continue;
    }

    throw new AppError(`บันทึกข้อมูลล้มเหลว: ${error.message}`, 500);
  }

  if (lastInsertError) {
    throw new AppError("เกิดปัญหาในการสร้างเลขคำขอ กรุณาลองใหม่อีกครั้ง", 500);
  }

  const settings = await getSettingsMap();
  const telegramStatus = await sendTelegramRequestNotification(settings, {
    reqId,
    name: payload.fullName,
    agency: payload.agency,
    citizenId: payload.citizenId,
    maskedId: payload.maskedCitizenId,
    dateText: payload.requestDateText,
    timeText: payload.requestTimeText,
    status: payload.status,
  });

  const { error: updateError } = await supabase
    .from("requests")
    .update({ telegram_status: telegramStatus.statusText, updated_at: new Date().toISOString() })
    .eq("req_id", reqId);

  if (updateError) {
    throw new AppError(`อัปเดตสถานะ Telegram ไม่สำเร็จ: ${updateError.message}`, 500);
  }

  return {
    success: true,
    message: `บันทึกข้อมูลสำเร็จ ${telegramStatus.message}`,
  };
}

export async function updateRequestStatusByReqId(reqId: string, input: UpdateRequestStatusInput) {
  if (!dashboardStatusValues.includes(input.status as (typeof dashboardStatusValues)[number])) {
    throw new AppError("สถานะที่เลือกไม่ถูกต้อง");
  }

  const supabase = getSupabaseAdminClient();
  const note = normalizeOptionalText(input.note, "-");

  const { data, error } = await supabase
    .from("requests")
    .update({
      status: input.status,
      note,
      updated_at: new Date().toISOString(),
    })
    .eq("req_id", reqId)
    .select("full_name")
    .single();

  if (error) {
    throw new AppError(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`, 500);
  }

  if (input.sendNotification) {
    const settings = await getSettingsMap();
    await sendTelegramStatusNotification(settings, {
      name: data.full_name,
      status: input.status,
      note,
    });
  }

  return { success: true };
}

export async function getRequestTelegramContextByReqId(reqId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .select("full_name, agency, citizen_id, masked_citizen_id")
    .eq("req_id", reqId)
    .maybeSingle();

  if (error) {
    throw new AppError(`โหลดข้อมูลสำหรับ Telegram ไม่สำเร็จ: ${error.message}`, 500);
  }

  if (!data) {
    return null;
  }

  return {
    fullName: data.full_name ?? "",
    agency: data.agency ?? "",
    citizenId: data.citizen_id ?? "",
    maskedCitizenId: data.masked_citizen_id ?? "",
  };
}

export async function persistTelegramStatusUpdate(reqId: string, action: TelegramAction) {
  const settings = await getSettingsMap();
  const actionConfig = getTelegramActionConfig(action, settings);
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("requests")
    .select("status")
    .eq("req_id", reqId)
    .maybeSingle();

  if (error) {
    throw new AppError(`ตรวจสอบสถานะปัจจุบันไม่สำเร็จ: ${error.message}`, 500);
  }

  if (!data || data.status === actionConfig.statusText) {
    return;
  }

  const { error: updateError } = await supabase
    .from("requests")
    .update({
      status: actionConfig.statusText,
      updated_at: new Date().toISOString(),
    })
    .eq("req_id", reqId);

  if (updateError) {
    throw new AppError(`อัปเดตสถานะจาก Telegram ไม่สำเร็จ: ${updateError.message}`, 500);
  }
}

export function createServerErrorResponse(error: unknown) {
  console.error(error);

  if (error instanceof AppError) {
    return Response.json({ message: error.message }, { status: error.status });
  }

  return Response.json({ message: getErrorMessage(error) }, { status: 500 });
}
