import { createFileRoute } from "@tanstack/react-router";
import { authenticateBot, jsonResponse, logActivity, assertBotInConversation, corsPreflight } from "@/lib/bot-api.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function makeMediaHandler(endpoint: string, mediaType: "image" | "video" | "audio" | "file") {
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

export const sendPhotoHandler = makeMediaHandler("sendPhoto", "image");
export const sendDocumentHandler = makeMediaHandler("sendDocument", "file");
export const sendVoiceHandler = makeMediaHandler("sendVoice", "audio");
export const sendVideoHandler = makeMediaHandler("sendVideo", "video");

// dummy route export so this isn't treated as a route file
export const Route = createFileRoute("/api/bot/_media")({
  server: { handlers: { OPTIONS: async () => corsPreflight() } },
});
