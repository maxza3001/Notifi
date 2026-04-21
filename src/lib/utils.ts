export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

export function getBangkokDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const formattedParts = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: formattedParts.year,
    month: formattedParts.month,
    day: formattedParts.day,
    hour: formattedParts.hour,
    minute: formattedParts.minute,
    second: formattedParts.second,
  };
}

export function formatThaiDate(date: Date) {
  const parts = getBangkokDateParts(date);
  return `${Number(parts.day)} ${THAI_MONTHS[Number(parts.month) - 1]} ${Number(parts.year) + 543}`;
}

export function formatBangkokDay(date: Date) {
  const parts = getBangkokDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatBangkokTime(date: Date) {
  const parts = getBangkokDateParts(date);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

export function generateRequestId(date: Date, attempt = 0) {
  const parts = getBangkokDateParts(date);
  const baseId = `REQ-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
  return attempt > 0 ? `${baseId}-${String(attempt).padStart(2, "0")}` : baseId;
}

export function validateCitizenId(id: string) {
  if (!/^\d{13}$/.test(id)) return false;

  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(id.charAt(index)) * (13 - index);
  }

  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === Number(id.charAt(12));
}

export function maskCitizenId(id: string) {
  if (!/^\d{13}$/.test(id)) return id;
  return `${id.substring(0, 1)}-${id.substring(1, 5)}-XXXXX-${id.substring(10, 12)}-${id.substring(12)}`;
}

export function sanitizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(value: string | null | undefined, fallback = "-") {
  const normalized = (value ?? "").trim();
  return normalized || fallback;
}

export function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isTruthySetting(value: string | undefined) {
  return (value ?? "").trim().toUpperCase() === "TRUE";
}
