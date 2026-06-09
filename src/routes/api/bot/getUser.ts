import { createFileRoute } from "@tanstack/react-router";
import { authenticateBot, jsonResponse, logActivity, corsPreflight } from "@/lib/bot-api.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/bot/getUser")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const started = Date.now();
        const auth = await authenticateBot(request);
        if (!auth.ok) return auth.response;
        const url = new URL(request.url);
        const user_id = url.searchParams.get("user_id");
        const username = url.searchParams.get("username");
        if (!user_id && !username) {
          return jsonResponse({ ok: false, error_code: 400, description: "user_id or username required" }, 400);
        }
        let q = supabaseAdmin.from("profiles").select("id, display_name, username, avatar_url, bio, is_bot");
        if (user_id) q = q.eq("id", user_id);
        else if (username) q = q.ilike("username", username);
        const { data, error } = await q.maybeSingle();
        if (error) return jsonResponse({ ok: false, error_code: 500, description: error.message }, 500);
        if (!data) return jsonResponse({ ok: false, error_code: 404, description: "User not found" }, 404);
        await logActivity({ bot_id: auth.bot.bot_id, endpoint: "getUser", status: 200, latency_ms: Date.now() - started });
        return jsonResponse({ ok: true, result: data });
      },
    },
  },
});
