import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Compass, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ChannelDiscover({ userId, onJoined }: { userId: string; onJoined: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState("");
  const qc = useQueryClient();

  const { data: channels = [] } = useQuery({
    queryKey: ["discover-channels", q],
    enabled: open,
    queryFn: async () => {
      let query = supabase.from("channels").select("*").eq("is_public", true).order("subscriber_count", { ascending: false }).limit(40);
      if (q.trim()) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  const join = async (id: string) => {
    const { error } = await supabase.from("channel_members").insert({ channel_id: id, user_id: userId, role: "subscriber" });
    if (error && !error.message.includes("duplicate")) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["channels", userId] });
    onJoined(id);
    setOpen(false);
  };

  const joinByInvite = async () => {
    const token = invite.trim().split("/").pop() ?? "";
    if (!token) return;
    const { data, error } = await supabase.rpc("join_channel_by_invite", { _token: token });
    if (error || !data) { toast.error(error?.message ?? "Invalid invite"); return; }
    qc.invalidateQueries({ queryKey: ["channels", userId] });
    onJoined(data as string);
    setOpen(false);
    setInvite("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Discover channels" className="rounded-full">
          <Compass className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Discover channels</DialogTitle>
          <DialogDescription>Browse public channels or join via invite link.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Paste invite link or token" className="rounded-full" />
            <Button onClick={joinByInvite} className="rounded-full">Join</Button>
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search public channels…" className="rounded-full" />
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin space-y-1">
          {channels.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No public channels yet.</p>
          ) : channels.map((c: any) => (
            <button key={c.id} onClick={() => join(c.id)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-accent/50">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.slug ? `@${c.slug} · ` : ""}{c.subscriber_count} subscriber{c.subscriber_count === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
