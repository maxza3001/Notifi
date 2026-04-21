import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.local");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("ไม่พบไฟล์ .env.local");
  }

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

async function getSettings(env) {
  const supabaseUrl = env.SUPABASE_URL && !env.SUPABASE_URL.includes("your-project.supabase.co")
    ? env.SUPABASE_URL
    : env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/app_settings?select=key,value&key=in.(TELEGRAM_BOT_TOKEN,TELEGRAM_CHAT_ID)`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`อ่าน app_settings ไม่สำเร็จ: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  if (!settings.TELEGRAM_BOT_TOKEN) {
    throw new Error("ยังไม่มี TELEGRAM_BOT_TOKEN ใน app_settings");
  }

  return settings;
}

async function callTelegram(token, method, payload = undefined) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error (${method}): ${data.description || "unknown error"}`);
  }

  return data.result;
}

function resolveWebhookUrl(env) {
  const explicitWebhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim();
  if (explicitWebhookUrl) {
    return explicitWebhookUrl;
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    throw new Error("ยังไม่ได้ตั้งค่า TELEGRAM_WEBHOOK_URL หรือ NEXT_PUBLIC_APP_URL");
  }

  return `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
}

function validateWebhookUrl(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`Webhook URL ต้องเป็น https public URL เท่านั้น: ${url}`);
  }

  if (/localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error(`Webhook URL ใช้ localhost ไม่ได้กับ Telegram: ${url}`);
  }
}

async function showWebhookInfo() {
  const env = readEnvFile(envPath);
  const settings = await getSettings(env);
  const result = await callTelegram(settings.TELEGRAM_BOT_TOKEN, "getWebhookInfo");

  console.log(JSON.stringify(result, null, 2));
}

async function setWebhook() {
  const env = readEnvFile(envPath);
  const settings = await getSettings(env);
  const webhookUrl = resolveWebhookUrl(env);
  validateWebhookUrl(webhookUrl);

  const result = await callTelegram(settings.TELEGRAM_BOT_TOKEN, "setWebhook", {
    url: webhookUrl,
  });

  console.log(JSON.stringify({ webhookUrl, result }, null, 2));
}

const command = process.argv[2];

try {
  if (command === "info") {
    await showWebhookInfo();
  } else if (command === "set") {
    await setWebhook();
  } else {
    throw new Error("ใช้คำสั่ง: npm run telegram:webhook:info หรือ npm run telegram:webhook:set");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
