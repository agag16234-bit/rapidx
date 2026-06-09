import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { regenerateBotToken, revokeBotToken, deleteBot } from "@/lib/bots.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Bot, Copy, RefreshCcw, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/bots/$botId")({
  head: () => ({ meta: [{ title: "Bot Dashboard — Premium Chat" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: BotDashboard,
});

function BotDashboard() {
  const { botId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const regenFn = useServerFn(regenerateBotToken);
  const revokeFn = useServerFn(revokeBotToken);
  const deleteFn = useServerFn(deleteBot);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const { data: bot } = useQuery({
    queryKey: ["bot", botId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bots")
        .select("id, owner_id, description, enabled, request_count, last_used_at, created_at, profiles:id(display_name, username, avatar_url, bio)")
        .eq("id", botId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: tokens } = useQuery({
    queryKey: ["bot-tokens", botId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bot_tokens")
        .select("id, token_prefix, created_at, revoked_at").eq("bot_id", botId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["bot-logs", botId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bot_activity_logs")
        .select("id, endpoint, status, latency_ms, conversation_id, error, created_at")
        .eq("bot_id", botId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (!bot) return <div className="p-6">Loading…</div>;
  if (bot.owner_id !== user.id) return <div className="p-6">Not authorized.</div>;
  const profile = bot.profiles as { display_name: string; username: string | null; avatar_url: string | null; bio: string | null } | null;

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const display_name = String(f.get("display_name") || "");
    const description = String(f.get("description") || "");
    const username = String(f.get("username") || "").toLowerCase();
    const enabled = f.get("enabled") === "on";
    if (!username.endsWith("bot")) { toast.error("Username must end with 'bot'"); return; }
    const { error: pErr } = await supabase.from("profiles").update({ display_name, bio: description, username }).eq("id", botId);
    if (pErr) { toast.error(pErr.message); return; }
    const { error: bErr } = await supabase.from("bots").update({ description, enabled }).eq("id", botId);
    if (bErr) { toast.error(bErr.message); return; }
    qc.invalidateQueries({ queryKey: ["bot", botId] });
    toast.success("Saved");
  }

  async function regenerate() {
    if (!confirm("Regenerate token? The current token will stop working immediately.")) return;
    try {
      const res = await regenFn({ data: { bot_id: botId } });
      setRevealedToken(res.token);
      qc.invalidateQueries({ queryKey: ["bot-tokens", botId] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function revoke(token_id: string) {
    if (!confirm("Revoke this token?")) return;
    try {
      await revokeFn({ data: { token_id } });
      qc.invalidateQueries({ queryKey: ["bot-tokens", botId] });
      toast.success("Revoked");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function removeBot() {
    if (!confirm("Delete this bot permanently?")) return;
    try {
      await deleteFn({ data: { bot_id: botId } });
      navigate({ to: "/bots" });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/bots" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <Bot className="h-7 w-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">{profile?.display_name} <Badge variant={bot.enabled ? "default" : "secondary"}>{bot.enabled ? "Enabled" : "Disabled"}</Badge></h1>
          <p className="text-sm text-muted-foreground">@{profile?.username} · created {new Date(bot.created_at).toLocaleDateString()}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={removeBot}><Trash2 className="h-5 w-5 text-destructive" /></Button>
      </div>

      <section className="glass-strong p-5 rounded-2xl grid grid-cols-3 gap-4">
        <Stat label="Requests" value={bot.request_count.toLocaleString()} />
        <Stat label="Last used" value={bot.last_used_at ? new Date(bot.last_used_at).toLocaleString() : "Never"} />
        <Stat label="Status" value={bot.enabled ? "Active" : "Disabled"} />
      </section>

      <section className="glass p-5 rounded-2xl space-y-4">
        <h2 className="font-semibold">Bot profile</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <div><Label>Display name</Label><Input name="display_name" defaultValue={profile?.display_name} required /></div>
          <div><Label>Username</Label><Input name="username" defaultValue={profile?.username ?? ""} required /></div>
          <div><Label>Description</Label><Textarea name="description" defaultValue={bot.description ?? ""} rows={3} /></div>
          <div className="flex items-center gap-2"><Switch id="enabled" name="enabled" defaultChecked={bot.enabled} /><Label htmlFor="enabled">Enabled</Label></div>
          <Button type="submit">Save</Button>
        </form>
      </section>

      <section className="glass p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">API tokens</h2>
          <Button size="sm" onClick={regenerate}><RefreshCcw className="h-4 w-4 mr-2" /> Regenerate</Button>
        </div>
        {revealedToken && (
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/30">
            <p className="text-xs font-medium mb-2">New token — copy it now:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all">{revealedToken}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(revealedToken); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(tokens ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-background/40">
              <code className="text-xs flex-1">{t.token_prefix}…{t.revoked_at && <span className="ml-2 text-destructive">revoked</span>}</code>
              <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
              {!t.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(t.id)}>Revoke</Button>}
            </div>
          ))}
        </div>
      </section>

      <section className="glass p-5 rounded-2xl space-y-3">
        <h2 className="font-semibold">Add bot to a group</h2>
        <p className="text-sm text-muted-foreground">
          Open a group you administer, tap members, and add <code className="px-1 bg-background/60 rounded">@{profile?.username}</code>.
          The bot can then send and receive messages in that group via the API.
        </p>
      </section>

      <section className="glass p-5 rounded-2xl space-y-3">
        <h2 className="font-semibold">Using the API (Python example)</h2>
        <pre className="text-xs bg-background/60 p-3 rounded-lg overflow-x-auto"><code>{`import requests

TOKEN = "YOUR_BOT_TOKEN"
BASE = "${origin}/api/bot"
H = {"Authorization": f"Bearer {TOKEN}"}

# who am i
print(requests.get(f"{BASE}/getMe", headers=H).json())

# poll for new messages
r = requests.get(f"{BASE}/getUpdates", headers=H).json()
for u in r["result"]:
    msg = u["message"]
    requests.post(f"{BASE}/sendMessage", headers=H, json={
        "chat_id": msg["chat_id"],
        "text": f"Echo: {msg['text']}",
    })`}</code></pre>
      </section>

      <section className="glass p-5 rounded-2xl space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Recent activity</h2>
        <div className="space-y-1 text-xs font-mono">
          {(logs ?? []).length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
          {(logs ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-3 py-1 border-b border-border/30">
              <span className={l.status < 300 ? "text-green-500" : "text-destructive"}>{l.status}</span>
              <span className="flex-1">{l.endpoint}</span>
              <span className="text-muted-foreground">{l.latency_ms}ms</span>
              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
