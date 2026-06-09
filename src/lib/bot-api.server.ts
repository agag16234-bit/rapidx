// Server-only helpers for the public Bot API routes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuthedBot = {
  bot_id: string;
  username: string | null;
  display_name: string;
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticateBot(request: Request): Promise<
  { ok: true; bot: AuthedBot } | { ok: false; response: Response }
> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, response: jsonResponse({ ok: false, error_code: 401, description: "Missing Bearer token" }, 401) };
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return { ok: false, response: jsonResponse({ ok: false, error_code: 401, description: "Empty token" }, 401) };
  }
  const hash = await sha256Hex(token);
  const { data: tok } = await supabaseAdmin
    .from("bot_tokens")
    .select("bot_id, revoked_at, bots!inner(id, enabled, owner_id)")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!tok || tok.revoked_at) {
    return { ok: false, response: jsonResponse({ ok: false, error_code: 401, description: "Invalid or revoked token" }, 401) };
  }
  // @ts-expect-error nested
  if (!tok.bots.enabled) {
    return { ok: false, response: jsonResponse({ ok: false, error_code: 403, description: "Bot disabled" }, 403) };
  }
  const { data: prof } = await supabaseAdmin
    .from("profiles").select("display_name, username").eq("id", tok.bot_id).single();
  return {
    ok: true,
    bot: { bot_id: tok.bot_id, display_name: prof?.display_name ?? "Bot", username: prof?.username ?? null },
  };
}

export async function logActivity(opts: {
  bot_id: string; endpoint: string; status: number; latency_ms: number;
  conversation_id?: string | null; error?: string | null;
}): Promise<void> {
  await supabaseAdmin.from("bot_activity_logs").insert({
    bot_id: opts.bot_id,
    endpoint: opts.endpoint,
    status: opts.status,
    latency_ms: opts.latency_ms,
    conversation_id: opts.conversation_id ?? null,
    error: opts.error ?? null,
  });
  await supabaseAdmin.rpc("increment_bot_request_count", { _bot_id: opts.bot_id });
}

export async function assertBotInConversation(bot_id: string, conversation_id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("conversation_members")
    .select("user_id").eq("conversation_id", conversation_id).eq("user_id", bot_id).maybeSingle();
  return !!data;
}
