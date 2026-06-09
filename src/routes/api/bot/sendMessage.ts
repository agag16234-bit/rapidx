import { createFileRoute } from "@tanstack/react-router";
import { authenticateBot, jsonResponse, logActivity, assertBotInConversation, corsPreflight } from "@/lib/bot-api.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/bot/sendMessage")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const started = Date.now();
        const auth = await authenticateBot(request);
        if (!auth.ok) return auth.response;
        let body: { chat_id?: string; text?: string; reply_to_message_id?: string };
        try { body = await request.json(); }
        catch { return jsonResponse({ ok: false, error_code: 400, description: "Invalid JSON" }, 400); }
        const chat_id = String(body.chat_id ?? "").trim();
        const text = String(body.text ?? "").trim();
        if (!chat_id || !text) {
          return jsonResponse({ ok: false, error_code: 400, description: "chat_id and text are required" }, 400);
        }
        if (text.length > 4000) {
          return jsonResponse({ ok: false, error_code: 400, description: "text too long (max 4000)" }, 400);
        }
        const member = await assertBotInConversation(auth.bot.bot_id, chat_id);
        if (!member) {
          await logActivity({ bot_id: auth.bot.bot_id, endpoint: "sendMessage", status: 403, latency_ms: Date.now() - started, conversation_id: chat_id, error: "not a member" });
          return jsonResponse({ ok: false, error_code: 403, description: "Bot is not a member of this chat" }, 403);
        }
        const { data, error } = await supabaseAdmin.from("messages").insert({
          conversation_id: chat_id, sender_id: auth.bot.bot_id, content: text,
        }).select("id, created_at").single();
        if (error) {
          await logActivity({ bot_id: auth.bot.bot_id, endpoint: "sendMessage", status: 500, latency_ms: Date.now() - started, conversation_id: chat_id, error: error.message });
          return jsonResponse({ ok: false, error_code: 500, description: error.message }, 500);
        }
        await logActivity({ bot_id: auth.bot.bot_id, endpoint: "sendMessage", status: 200, latency_ms: Date.now() - started, conversation_id: chat_id });
        return jsonResponse({ ok: true, result: { message_id: data.id, chat_id, text, date: data.created_at, from: auth.bot } });
      },
    },
  },
});
