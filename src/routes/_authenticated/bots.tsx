import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createBot, deleteBot } from "@/lib/bots.functions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Bot, Plus, Copy, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => ({ meta: [{ title: "BotFather — Premium Chat" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: BotsPage,
});

type BotRow = {
  id: string; description: string | null; enabled: boolean; request_count: number;
  last_used_at: string | null; created_at: string;
  profiles: { display_name: string; username: string | null; avatar_url: string | null } | null;
};

function BotsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const createFn = useServerFn(createBot);
  const deleteFn = useServerFn(deleteBot);
  const [open, setOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: bots, isLoading } = useQuery({
    queryKey: ["bots", user.id],
    queryFn: async (): Promise<BotRow[]> => {
      const { data, error } = await supabase.from("bots")
        .select("id, description, enabled, request_count, last_used_at, created_at, profiles:id(display_name, username, avatar_url)")
        .eq("owner_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BotRow[];
    },
  });

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCreating(true);
    try {
      const res = await createFn({ data: {
        display_name: String(f.get("display_name") || ""),
        username: String(f.get("username") || ""),
        description: String(f.get("description") || "") || null,
      }});
      setNewToken(res.token);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bots", user.id] });
      toast.success("Bot created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bot");
    } finally { setCreating(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bot? This cannot be undone.")) return;
    try {
      await deleteFn({ data: { bot_id: id } });
      qc.invalidateQueries({ queryKey: ["bots", user.id] });
      toast.success("Bot deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link to="/chats" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <Bot className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">BotFather</h1>
            <p className="text-sm text-muted-foreground">Create and manage your bots</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="glass-strong"><Plus className="h-4 w-4 mr-2" /> New Bot</Button></DialogTrigger>
          <DialogContent className="glass-strong">
            <DialogHeader><DialogTitle>Create a bot</DialogTitle><DialogDescription>Username must end with "bot" (e.g. weather_bot).</DialogDescription></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label htmlFor="display_name">Display name</Label><Input id="display_name" name="display_name" required maxLength={64} /></div>
              <div><Label htmlFor="username">Username</Label><Input id="username" name="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" placeholder="my_cool_bot" /></div>
              <div><Label htmlFor="description">Description</Label><Textarea id="description" name="description" maxLength={500} rows={3} /></div>
              <Button type="submit" disabled={creating} className="w-full">{creating ? "Creating…" : "Create bot"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {newToken && (
        <div className="glass-strong p-4 rounded-2xl mb-6 border border-primary/30">
          <p className="text-sm font-medium mb-2">Save this token now — it will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-background/50 rounded text-xs break-all">{newToken}</code>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(newToken); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setNewToken(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && (bots ?? []).length === 0 && (
          <div className="glass p-12 rounded-2xl text-center text-muted-foreground">
            No bots yet. Create your first bot to get an API token.
          </div>
        )}
        {(bots ?? []).map((b) => (
          <div key={b.id} className="glass p-4 rounded-2xl flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="h-6 w-6 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link to="/bots/$botId" params={{ botId: b.id }} className="font-semibold hover:underline">{b.profiles?.display_name ?? "Bot"}</Link>
                <Badge variant={b.enabled ? "default" : "secondary"}>{b.enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">@{b.profiles?.username} · {b.request_count.toLocaleString()} requests</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => handleDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
