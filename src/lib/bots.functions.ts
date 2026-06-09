import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Generate a Telegram-style token: "<bot_id_short>:<random>"
async function generateToken(): Promise<{ token: string; prefix: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const id = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  const token = `${id}:${random}`;
  const prefix = token.slice(0, 12);
  const data = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, prefix, hash };
}

const createBotInput = z.object({
  display_name: z.string().trim().min(1).max(64),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  description: z.string().max(500).optional().nullable(),
});

export const createBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createBotInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const username = data.username.toLowerCase();
    if (!username.endsWith("bot")) {
      throw new Error("Bot username must end with 'bot' (e.g. weather_bot)");
    }

    // uniqueness check
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("id").ilike("username", username).maybeSingle();
    if (existing) throw new Error("Username already taken");

    // Create an auth user for the bot. Random email + password — sign-in is irrelevant.
    const email = `bot_${crypto.randomUUID()}@bots.premiumchat.local`;
    const password = crypto.randomUUID() + crypto.randomUUID();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name, username, is_bot: true },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create bot user");
    const botId = created.user.id;

    // The handle_new_user trigger inserts a profile. Patch it.
    const { error: profErr } = await supabaseAdmin.from("profiles").update({
      display_name: data.display_name,
      username,
      is_bot: true,
      bio: data.description ?? null,
    }).eq("id", botId);
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(botId);
      throw new Error(profErr.message);
    }

    const { error: botErr } = await supabaseAdmin.from("bots").insert({
      id: botId, owner_id: userId, description: data.description ?? null,
    });
    if (botErr) {
      await supabaseAdmin.auth.admin.deleteUser(botId);
      throw new Error(botErr.message);
    }

    const { token, prefix, hash } = await generateToken();
    await supabaseAdmin.from("bot_tokens").insert({
      bot_id: botId, token_hash: hash, token_prefix: prefix,
    });

    return { bot_id: botId, token };
  });

export const regenerateBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bot_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bot } = await supabaseAdmin.from("bots").select("id,owner_id").eq("id", data.bot_id).maybeSingle();
    if (!bot || bot.owner_id !== context.userId) throw new Error("Not authorized");
    // revoke all existing
    await supabaseAdmin.from("bot_tokens").update({ revoked_at: new Date().toISOString() })
      .eq("bot_id", data.bot_id).is("revoked_at", null);
    const { token, prefix, hash } = await generateToken();
    await supabaseAdmin.from("bot_tokens").insert({ bot_id: data.bot_id, token_hash: hash, token_prefix: prefix });
    return { token };
  });

export const revokeBotToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tok } = await supabaseAdmin.from("bot_tokens")
      .select("id,bot_id,bots!inner(owner_id)").eq("id", data.token_id).maybeSingle();
    const tokRow = tok as (typeof tok & { bots: { owner_id: string } | null }) | null;
    if (!tokRow || tokRow.bots?.owner_id !== context.userId) throw new Error("Not authorized");
    await supabaseAdmin.from("bot_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.token_id);
    return { ok: true };
  });

export const deleteBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bot_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bot } = await supabaseAdmin.from("bots").select("id,owner_id").eq("id", data.bot_id).maybeSingle();
    if (!bot || bot.owner_id !== context.userId) throw new Error("Not authorized");
    // Deleting the auth user cascades to profiles → bots → tokens → memberships → reactions etc.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.bot_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
