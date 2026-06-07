import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ChannelCreateDialog({ userId, onCreated }: { userId: string; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const submit = async () => {
    if (!name.trim()) { toast.error("Channel name required"); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("create_channel", {
      _name: name.trim(),
      _slug: slug.trim() || null,
      _description: desc.trim() || null,
      _avatar_url: null,
      _is_public: isPublic,
    });
    setLoading(false);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    toast.success("Channel created");
    qc.invalidateQueries({ queryKey: ["channels", userId] });
    onCreated(data as string);
    setOpen(false);
    setName(""); setSlug(""); setDesc(""); setIsPublic(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="New channel" className="rounded-full">
          <Megaphone className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">New channel</DialogTitle>
          <DialogDescription>Broadcast updates to your subscribers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Channel" maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Public handle (optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input className="pl-7" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="mychannel" maxLength={32} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's this channel about?" rows={3} />
          </div>
          <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-3">
            <div>
              <div className="text-sm font-semibold">Public channel</div>
              <div className="text-xs text-muted-foreground">Anyone can find and join. Off = invite only.</div>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={loading} className="rounded-full bg-gradient-primary text-white">
            {loading ? "Creating…" : "Create channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
