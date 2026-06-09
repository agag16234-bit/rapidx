import { createFileRoute } from "@tanstack/react-router";
import { authenticateBot, jsonResponse, logActivity, corsPreflight } from "@/lib/bot-api.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/bot/getMe")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const started = Date.now();
        const auth = await authenticateBot(request);
        if (!auth.ok) return auth.response;
        const { data: bot } = await supabaseAdmin.from("bots")
          .select("id, description, enabled, request_count, created_at").eq("id", auth.bot.bot_id).single();
        const { data: prof } = await supabaseAdmin.from("profiles")
          .select("display_name, username, avatar_url").eq("id", auth.bot.bot_id).single();
        await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getMe", status: 200, latency_ms: Date.now() - started });
        return jsonResponse({
          ok: true,
          result: {
            id: auth.bot.bot_id, is_bot: true,
            username: prof?.username, display_name: prof?.display_name, avatar_url: prof?.avatar_url,
            description: bot?.description, enabled: bot?.enabled,
            request_count: bot?.request_count, created_at: bot?.created_at,
          },
        });
      },
    },
  },
});
