import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/messenger/Media";
import { toast } from "sonner";
import { Check, Search, Users } from "lucide-react";

type Profile = {
  id: string; display_name: string; username: string | null; avatar_url: string | null;
};

export function GroupCreateDialog({
  userId, open, onOpenChange, onCreated,
}: { userId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"members" | "details">("members");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: people = [] } = useQuery({
    queryKey: ["people", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,username,avatar_url")
        .neq("id", userId).order("display_name").limit(100);
      return (data ?? []) as Profile[];
    },
  });

  const filtered = people.filter((p) => {
    const s = q.toLowerCase().replace(/^@/, "");
    return !s || p.display_name.toLowerCase().includes(s) || (p.username ?? "").toLowerCase().includes(s);
  });

  const reset = () => {
    setStep("members"); setQ(""); setSelected(new Set()); setName(""); setDescription("");
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const create = async () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_group", {
      _name: name.trim(),
      _description: description.trim(),
      _avatar_url: "",
      _member_ids: Array.from(selected),
    });
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Failed to create group"); return; }
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
    onCreated(data as string);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {step === "members" ? "Add members" : "Group details"}
          </DialogTitle>
          <DialogDescription>
            {step === "members"
              ? `Choose people to add to your new group${selected.size ? ` · ${selected.size} selected` : ""}.`
              : "Give your group a name and optional description."}
          </DialogDescription>
        </DialogHeader>

        {step === "members" ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No people found.</p>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((p) => {
                    const on = selected.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => toggle(p.id)}
                          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                            on ? "bg-primary/10" : "hover:bg-accent"
                          }`}
                        >
                          <UserAvatar path={p.avatar_url} name={p.display_name} className="h-10 w-10" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{p.display_name}</div>
                            <div className="truncate text-xs text-muted-foreground">@{p.username ?? "user"}</div>
                          </div>
                          {on && (
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={selected.size === 0} onClick={() => setStep("details")}>
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Group name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend hikers" maxLength={80} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this group about?" rows={3} maxLength={280} />
              </div>
              <p className="text-xs text-muted-foreground">{selected.size} member{selected.size === 1 ? "" : "s"} will be added.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("members")}>Back</Button>
              <Button onClick={create} disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create group"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
