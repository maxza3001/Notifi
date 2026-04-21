import "server-only";

import {
  buildTelegramInlineKeyboard,
  getInitialTelegramActionRows,
  getNextTelegramActionRows,
  getTelegramActionConfig,
} from "@/lib/settings";
import type { SettingsMap, TelegramAction, TelegramRequestNotificationPayload } from "@/lib/types";
import { escapeTelegramHtml, isTruthySetting } from "@/lib/utils";

type TelegramApiResult = {
  ok?: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
};

async function callTelegramApi(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  let result: TelegramApiResult = {};

  try {
    result = (await response.json()) as TelegramApiResult;
  } catch {
    result = { ok: false, description: "Telegram response was not valid JSON" };
  }

  return result;
}

function getTelegramConfig(settings: SettingsMap) {
  const token = settings.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = settings.TELEGRAM_CHAT_ID?.trim();
  return {
    token,
    chatId,
    isConfigured: Boolean(token && chatId),
  };
}

export async function sendTelegramRequestNotification(settings: SettingsMap, payload: TelegramRequestNotificationPayload) {
  const { token, chatId, isConfigured } = getTelegramConfig(settings);
  if (!isConfigured || !token || !chatId) {
    return { statusText: "Not Configured", message: "(ยังไม่ได้ตั้งค่า Telegram)" };
  }

  const displayId = isTruthySetting(settings.SEND_FULL_ID) ? payload.citizenId : payload.maskedId;
  const keyboard = buildTelegramInlineKeyboard(getInitialTelegramActionRows(), payload.reqId, settings);

  const message = `🔔 <b>แจ้งเตือนคำขอหนังสือบำเหน็จค้ำประกัน</b>\n\n` +
    `👤 <b>ชื่อผู้ขอ:</b> ${escapeTelegramHtml(payload.name)}\n` +
    `🏢 <b>ส่วนราชการ:</b> ${escapeTelegramHtml(payload.agency)}\n` +
    `🆔 <b>เลขบัตรประชาชน:</b> <code>${escapeTelegramHtml(displayId)}</code>\n` +
    `📅 <b>วันที่:</b> ${escapeTelegramHtml(payload.dateText)} ⏰ ${escapeTelegramHtml(payload.timeText)}\n` +
    `📌 <b>สถานะ:</b> ${escapeTelegramHtml(payload.status)}`;

  const result = await callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });

  if (result.ok) {
    return { statusText: "Success", message: "และส่งแจ้งเตือน Telegram แล้ว" };
  }

  return { statusText: "Error", message: "(ส่ง Telegram ไม่สำเร็จ)" };
}

export async function sendTelegramStatusNotification(settings: SettingsMap, payload: { name: string; status: string; note: string }) {
  const { token, chatId, isConfigured } = getTelegramConfig(settings);
  if (!isConfigured || !token || !chatId) {
    return;
  }

  const message = `🔄 <b>อัปเดตสถานะคำขอ</b>\n\n` +
    `👤 <b>ผู้ขอ:</b> ${escapeTelegramHtml(payload.name)}\n` +
    `📌 <b>สถานะใหม่:</b> <b>${escapeTelegramHtml(payload.status)}</b>\n` +
    `📝 <b>หมายเหตุ:</b> ${escapeTelegramHtml(payload.note || "-")}`;

  await callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
  });
}

export async function sendTelegramCallbackFeedback(settings: SettingsMap, payload: {
  action: TelegramAction;
  reqId: string;
  callbackId: string;
  messageId?: number;
  chatId?: number | string;
  actionBy: string;
}) {
  const { token, isConfigured } = getTelegramConfig(settings);
  if (!isConfigured || !token || !payload.messageId || !payload.chatId) return;

  const actionConfig = getTelegramActionConfig(payload.action, settings);
  const newKeyboard = buildTelegramInlineKeyboard(getNextTelegramActionRows(payload.action), payload.reqId, settings);
  const quickAlertMsg = `${actionConfig.icon} <b>อัปเดตสถานะแล้ว</b>\n\n` +
    `🆔 <b>เลขที่คำขอ:</b> ${escapeTelegramHtml(payload.reqId)}\n` +
    `📌 <b>สถานะปัจจุบัน:</b> <b>${escapeTelegramHtml(actionConfig.statusText)}</b>\n` +
    `👨‍💻 <b>ผู้ดำเนินการ:</b> ${escapeTelegramHtml(payload.actionBy)}`;

  await Promise.all([
    callTelegramApi(token, "answerCallbackQuery", {
      callback_query_id: payload.callbackId,
      text: `กำลังอัปเดตเป็น: ${actionConfig.statusText}...`,
    }),
    callTelegramApi(token, "editMessageReplyMarkup", {
      chat_id: payload.chatId,
      message_id: payload.messageId,
      reply_markup: { inline_keyboard: [] },
    }),
    callTelegramApi(token, "sendMessage", {
      chat_id: payload.chatId,
      text: quickAlertMsg,
      parse_mode: "HTML",
      reply_to_message_id: payload.messageId,
      ...(newKeyboard.length > 0 ? { reply_markup: { inline_keyboard: newKeyboard } } : {}),
    }),
  ]);
}
