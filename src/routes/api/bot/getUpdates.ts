import { createFileRoute } from "@tanstack/react-router";
import { authenticateBot, jsonResponse, logActivity, corsPreflight } from "@/lib/bot-api.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// GET /api/bot/getUpdates?offset=<ISO date>&limit=100
// Returns messages in conversations the bot is a member of, optionally newer than `offset`.
export const Route = createFileRoute("/api/bot/getUpdates")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const started = Date.now();
        const auth = await authenticateBot(request);
        if (!auth.ok) return auth.response;
        const url = new URL(request.url);
        const offset = url.searchParams.get("offset");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 200);

        const { data: convs } = await supabaseAdmin.from("conversation_members")
          .select("conversation_id").eq("user_id", auth.bot.bot_id);
        const convIds = (convs ?? []).map((c) => c.conversation_id);
        if (convIds.length === 0) {
          await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getUpdates", status: 200, latency_ms: Date.now() - started });
          return jsonResponse({ ok: true, result: [] });
        }
        let q = supabaseAdmin.from("messages")
          .select("id, conversation_id, sender_id, content, media_url, media_type, media_name, created_at")
          .in("conversation_id", convIds)
          .neq("sender_id", auth.bot.bot_id)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (offset) q = q.gt("created_at", offset);
        const { data: msgs, error } = await q;
        if (error) {
          await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getUpdates", status: 500, latency_ms: Date.now() - started, error: error.message });
          return jsonResponse({ ok: false, error_code: 500, description: error.message }, 500);
        }
        const senderIds = Array.from(new Set((msgs ?? []).map((m) => m.sender_id)));
        const { data: senders } = senderIds.length
          ? await supabaseAdmin.from("profiles").select("id, display_name, username, avatar_url, is_bot").in("id", senderIds)
          : { data: [] };
        const senderMap = new Map((senders ?? []).map((p) => [p.id, p]));
        const updates = (msgs ?? []).map((m) => ({
          update_id: m.id,
          message: {
            message_id: m.id,
            chat_id: m.conversation_id,
            date: m.created_at,
            text: m.content,
            media: m.media_url ? { url: m.media_url, type: m.media_type, name: m.media_name } : null,
            from: senderMap.get(m.sender_id) ?? { id: m.sender_id },
          },
        }));
        await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getUpdates", status: 200, latency_ms: Date.now() - started });
        return jsonResponse({ ok: true, result: updates });
      },
    },
  },
});
