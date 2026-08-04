// =============================================================================
// _shared/http.ts — CORS, phản hồi JSON, xác định chủ sở hữu dữ liệu
// =============================================================================

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const preflight = (req: Request) =>
  req.method === 'OPTIONS' ? new Response('ok', { headers: CORS }) : null;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });

export const fail = (message: string, status = 400) =>
  json({ error: message }, status);

export const text = (body: string, contentType = 'text/plain; charset=utf-8', status = 200) =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': contentType } });

/** Client bỏ qua RLS — chỉ dùng trong Edge Function, luôn ghi kèm owner rõ ràng. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Client theo quyền công khai (anon) — dùng cho feed. */
export function anonClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Xác định tài khoản sở hữu dữ liệu.
 * - Gọi từ trình duyệt: lấy user từ JWT trong header Authorization.
 * - Gọi từ Cron (dùng service role): không có user → dùng biến môi trường OWNER_UID.
 */
export async function resolveOwner(req: Request, admin: SupabaseClient): Promise<string> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY');

  if (token && token !== serviceKey && token !== anonKey) {
    const { data } = await admin.auth.getUser(token);
    if (data?.user?.id) return data.user.id;
  }

  const fallback = Deno.env.get('OWNER_UID');
  if (fallback) return fallback;

  throw new Error(
    'Không xác định được tài khoản. Khi chạy bằng Cron, hãy đặt biến OWNER_UID: ' +
    'supabase secrets set OWNER_UID=<user id của bạn>',
  );
}
