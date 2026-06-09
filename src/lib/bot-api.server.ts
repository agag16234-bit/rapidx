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
  const botRow = (tok.bots as unknown) as { id: string; enabled: boolean; owner_id: string } | null;
  if (!botRow?.enabled) {
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

export function makeSendMediaHandler(endpoint: string, mediaType: "image" | "video" | "audio" | "file") {
  return async ({ request }: { request: Request }) => {
    const started = Date.now();
    const auth = await authenticateBot(request);
    if (!auth.ok) return auth.response;
    let body: { chat_id?: string; url?: string; caption?: string; file_name?: string; mime_type?: string; size?: number };
    try { body = await request.json(); }
    catch { return jsonResponse({ ok: false, error_code: 400, description: "Invalid JSON" }, 400); }
    const chat_id = String(body.chat_id ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!chat_id || !url) {
      return jsonResponse({ ok: false, error_code: 400, description: "chat_id and url are required" }, 400);
    }
    if (!/^https?:\/\//i.test(url)) {
      return jsonResponse({ ok: false, error_code: 400, description: "url must be http(s)" }, 400);
    }
    const member = await assertBotInConversation(auth.bot.bot_id, chat_id);
    if (!member) {
      await logActivity({ bot_id: auth.bot.bot_id, endpoint, status: 403, latency_ms: Date.now() - started, conversation_id: chat_id, error: "not a member" });
      return jsonResponse({ ok: false, error_code: 403, description: "Bot is not a member of this chat" }, 403);
    }
    const { data, error } = await supabaseAdmin.from("messages").insert({
      conversation_id: chat_id,
      sender_id: auth.bot.bot_id,
      content: body.caption ?? null,
      media_url: url,
      media_type: mediaType,
      media_name: body.file_name ?? null,
      media_mime: body.mime_type ?? null,
      media_size: body.size ?? null,
    }).select("id, created_at").single();
    if (error) {
      await logActivity({ bot_id: auth.bot.bot_id, endpoint, status: 500, latency_ms: Date.now() - started, conversation_id: chat_id, error: error.message });
      return jsonResponse({ ok: false, error_code: 500, description: error.message }, 500);
    }
    await logActivity({ bot_id: auth.bot.bot_id, endpoint, status: 200, latency_ms: Date.now() - started, conversation_id: chat_id });
    return jsonResponse({ ok: true, result: { message_id: data.id, chat_id, date: data.created_at, from: auth.bot } });
  };
}
