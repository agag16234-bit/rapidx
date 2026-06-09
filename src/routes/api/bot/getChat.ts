import { createFileRoute } from "@tanstack/react-router";
import { authenticateBot, jsonResponse, logActivity, assertBotInConversation, corsPreflight } from "@/lib/bot-api.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/bot/getChat")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const started = Date.now();
        const auth = await authenticateBot(request);
        if (!auth.ok) return auth.response;
        const url = new URL(request.url);
        const chat_id = url.searchParams.get("chat_id") ?? "";
        if (!chat_id) return jsonResponse({ ok: false, error_code: 400, description: "chat_id required" }, 400);
        if (!(await assertBotInConversation(auth.bot.bot_id, chat_id))) {
          await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getChat", status: 403, latency_ms: Date.now() - started, conversation_id: chat_id });
          return jsonResponse({ ok: false, error_code: 403, description: "Not a member" }, 403);
        }
        const { data: conv } = await supabaseAdmin.from("conversations")
          .select("id, is_group, name, description, avatar_url, created_at").eq("id", chat_id).single();
        const { count } = await supabaseAdmin.from("conversation_members")
          .select("user_id", { count: "exact", head: true }).eq("conversation_id", chat_id);
        await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getChat", status: 200, latency_ms: Date.now() - started, conversation_id: chat_id });
        return jsonResponse({ ok: true, result: { ...conv, member_count: count ?? 0 } });
      },
    },
  },
});
