import "server-only";

import { createClient } from "@supabase/supabase-js";

import { AppError } from "@/lib/utils";

function isPlaceholderSupabaseUrl(value: string | undefined) {
  if (!value) return true;
  return value.includes("your-project.supabase.co");
}

function readJwtRole(jwt: string | undefined) {
  if (!jwt) return null;

  const parts = jwt.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseAdminClient() {
  const supabaseUrl = !isPlaceholderSupabaseUrl(process.env.SUPABASE_URL)
    ? process.env.SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AppError("ยังไม่ได้ตั้งค่า Supabase environment variables", 500);
  }

  const jwtRole = readJwtRole(serviceRoleKey);
  if (jwtRole && jwtRole !== "service_role") {
    throw new AppError(
      "SUPABASE_SERVICE_ROLE_KEY ยังไม่ถูกต้อง: ตอนนี้เป็นคีย์ประเภท anon/publishable ให้เปลี่ยนเป็น service_role key จาก Supabase Dashboard",
      500,
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
