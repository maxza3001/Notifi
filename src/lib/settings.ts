import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SettingsMap, TelegramAction, TelegramActionConfig } from "@/lib/types";

const DEFAULT_SETTINGS_ROWS = [
  { key: "TELEGRAM_BOT_TOKEN", value: "", description: "Token จาก BotFather" },
  { key: "TELEGRAM_CHAT_ID", value: "", description: "Chat ID ของกลุ่มหรือบุคคล" },
  { key: "SEND_FULL_ID", value: "FALSE", description: "ตั้งเป็น TRUE หากต้องการส่งเลขบัตรเต็มไปใน Telegram" },
  { key: "APP_TITLE", value: "ระบบบำเหน็จค้ำประกัน", description: "ชื่อระบบ" },
  { key: "ENABLE_DASHBOARD", value: "TRUE", description: "เปิดหรือปิดหน้า Dashboard" },
  { key: "TG_BTN_RECEIVE_TEXT", value: "📥 รับเรื่องแล้ว", description: "ข้อความปุ่ม Telegram: รับเรื่องแล้ว" },
  { key: "TG_BTN_RECEIVE_STATUS", value: "รับเรื่องแล้ว", description: "ค่าสถานะเมื่อกดปุ่มรับเรื่องแล้ว" },
  { key: "TG_BTN_PENDING_TEXT", value: "⏳ รอพิจารณา", description: "ข้อความปุ่ม Telegram: รอพิจารณา" },
  { key: "TG_BTN_PENDING_STATUS", value: "รอพิจารณา", description: "ค่าสถานะเมื่อกดปุ่มรอพิจารณา" },
  { key: "TG_BTN_APPROVE_TEXT", value: "✅ อนุมัติแล้ว", description: "ข้อความปุ่ม Telegram: อนุมัติแล้ว" },
  { key: "TG_BTN_APPROVE_STATUS", value: "อนุมัติแล้ว", description: "ค่าสถานะเมื่อกดปุ่มอนุมัติแล้ว" },
];

const TELEGRAM_ACTION_DEFAULTS: Record<TelegramAction, Omit<TelegramActionConfig, "action"> & { textKey: string; statusKey: string }> = {
  RECEIVE: {
    textKey: "TG_BTN_RECEIVE_TEXT",
    statusKey: "TG_BTN_RECEIVE_STATUS",
    buttonText: "📥 รับเรื่องแล้ว",
    statusText: "รับเรื่องแล้ว",
    icon: "📥",
  },
  PENDING: {
    textKey: "TG_BTN_PENDING_TEXT",
    statusKey: "TG_BTN_PENDING_STATUS",
    buttonText: "⏳ รอพิจารณา",
    statusText: "รอพิจารณา",
    icon: "⏳",
  },
  APPROVE: {
    textKey: "TG_BTN_APPROVE_TEXT",
    statusKey: "TG_BTN_APPROVE_STATUS",
    buttonText: "✅ อนุมัติแล้ว",
    statusText: "อนุมัติแล้ว",
    icon: "✅",
  },
};

let settingsCache: SettingsMap | null = null;
let settingsCacheExpiresAt = 0;

function getDefaultSettingsMap() {
  return DEFAULT_SETTINGS_ROWS.reduce<SettingsMap>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export async function ensureDefaultSettings() {
  const supabase = getSupabaseAdminClient();
  await supabase.from("app_settings").upsert(DEFAULT_SETTINGS_ROWS, {
    onConflict: "key",
    ignoreDuplicates: true,
  });
}

export async function getSettingsMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && settingsCache && now < settingsCacheExpiresAt) {
    return settingsCache;
  }

  const supabase = getSupabaseAdminClient();
  await ensureDefaultSettings();

  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw error;

  const mergedSettings = getDefaultSettingsMap();
  for (const row of data ?? []) {
    if (row.key) {
      mergedSettings[row.key.trim()] = (row.value ?? "").trim();
    }
  }

  settingsCache = mergedSettings;
  settingsCacheExpiresAt = now + 60_000;
  return mergedSettings;
}

export function invalidateSettingsCache() {
  settingsCache = null;
  settingsCacheExpiresAt = 0;
}

export function getTelegramActionConfig(action: TelegramAction, settings: SettingsMap): TelegramActionConfig {
  const defaults = TELEGRAM_ACTION_DEFAULTS[action];

  return {
    action,
    buttonText: settings[defaults.textKey]?.trim() || defaults.buttonText,
    statusText: settings[defaults.statusKey]?.trim() || defaults.statusText,
    icon: defaults.icon,
  };
}

export function getInitialTelegramActionRows(): TelegramAction[][] {
  return [
    ["RECEIVE", "PENDING"],
    ["APPROVE"],
  ];
}

export function getNextTelegramActionRows(action: TelegramAction): TelegramAction[][] {
  if (action === "RECEIVE") return [["PENDING", "APPROVE"]];
  if (action === "PENDING") return [["APPROVE"]];
  return [];
}

export function buildTelegramInlineKeyboard(actionRows: TelegramAction[][], reqId: string, settings: SettingsMap) {
  return actionRows.map((row) =>
    row.map((action) => {
      const config = getTelegramActionConfig(action, settings);

      return {
        text: config.buttonText,
        callback_data: `${action}|${reqId}`,
      };
    }),
  );
}
