import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/messenger/Media";
import { toast } from "sonner";
import { Crown, Shield, UserMinus, UserPlus, LogOut, Trash2, Search, Check, Pencil, Settings as SettingsIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GroupSettingsSheet } from "@/components/messenger/GroupSettingsSheet";

type Profile = {
  id: string; display_name: string; username: string | null; avatar_url: string | null;
};
type Member = { user_id: string; role: "owner" | "admin" | "member" };

export function GroupInfoSheet({
  conversationId, userId, open, onOpenChange, onClosed,
}: {
  conversationId: string; userId: string;
  open: boolean; onOpenChange: (v: boolean) => void; onClosed?: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["group-info", conversationId],
    enabled: open,
    queryFn: async () => {
      const [{ data: conv }, { data: mems }] = await Promise.all([
        supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(),
        supabase.from("conversation_members").select("user_id,role").eq("conversation_id", conversationId),
      ]);
      const ids = (mems ?? []).map((m) => m.user_id);
      const { data: profs } = await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const profileMap = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      return {
        conv,
        members: (mems ?? []).map((m) => ({ ...(m as Member), profile: profileMap.get(m.user_id) ?? null })),
      };
    },
  });

  const myRole = data?.members.find((m) => m.user_id === userId)?.role;
  const canEdit = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const sortedMembers = useMemo(() => {
    const order = { owner: 0, admin: 1, member: 2 } as const;
    return [...(data?.members ?? [])].sort(
      (a, b) =>
        order[a.role] - order[b.role] ||
        (a.profile?.display_name ?? "").localeCompare(b.profile?.display_name ?? ""),
    );
  }, [data?.members]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["group-info", conversationId] });

  const setRole = async (uid: string, role: "admin" | "member" | "owner") => {
    const { error } = await supabase.from("conversation_members").update({ role }).eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated");
    refresh();
  };

  const removeMember = async (uid: string) => {
    const { error } = await supabase.from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Member removed");
    refresh();
  };

  const leaveGroup = async () => {
    if (isOwner) { toast.error("Transfer ownership before leaving"); return; }
    const { error } = await supabase.from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("You left the group");
    onOpenChange(false);
    onClosed?.();
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
  };

  const deleteGroup = async () => {
    const { error } = await supabase.from("conversations").delete().eq("id", conversationId);
    if (error) { toast.error(error.message); return; }
    toast.success("Group deleted");
    onOpenChange(false);
    onClosed?.();
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Group info</SheetTitle>
          <SheetDescription>Manage group settings and members.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col items-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-primary text-white shadow-elevated">
            <span className="text-2xl font-bold">{(data?.conv?.name ?? "G").slice(0, 1).toUpperCase()}</span>
          </div>
          <h3 className="mt-3 text-lg font-bold">{data?.conv?.name ?? "Group"}</h3>
          {data?.conv?.description && (
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{data.conv.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{data?.members.length ?? 0} members</p>
          {canEdit && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit group
            </Button>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Members</h4>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          )}
        </div>

        <ul className="mt-2 space-y-1">
          {sortedMembers.map((m) => {
            const isMe = m.user_id === userId;
            const canManage = canEdit && !isMe && m.role !== "owner";
            return (
              <li key={m.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent">
                <UserAvatar path={m.profile?.avatar_url} name={m.profile?.display_name ?? "?"} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{m.profile?.display_name ?? "Unknown"}{isMe && " (you)"}</span>
                    {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    {m.role === "admin" && <Shield className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    @{m.profile?.username ?? "user"} · {m.role}
                  </div>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">Manage</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.role === "member" ? (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "admin")}>
                          <Shield className="mr-2 h-4 w-4" /> Make admin
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "member")}>
                          <Shield className="mr-2 h-4 w-4" /> Demote to member
                        </DropdownMenuItem>
                      )}
                      {isOwner && (
                        <DropdownMenuItem onClick={() => setRole(m.user_id, "owner")}>
                          <Crown className="mr-2 h-4 w-4" /> Transfer ownership
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => removeMember(m.user_id)}>
                        <UserMinus className="mr-2 h-4 w-4" /> Remove from group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-2 border-t pt-4">
          {!isOwner && (
            <Button variant="outline" className="w-full" onClick={leaveGroup}>
              <LogOut className="mr-2 h-4 w-4" /> Leave group
            </Button>
          )}
          {isOwner && (
            <Button variant="destructive" className="w-full" onClick={deleteGroup}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete group
            </Button>
          )}
        </div>

        {data?.conv && (
          <EditGroupDialog
            open={editing}
            onOpenChange={setEditing}
            conversationId={conversationId}
            initialName={data.conv.name ?? ""}
            initialDescription={data.conv.description ?? ""}
            onSaved={refresh}
          />
        )}
        <AddMembersDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          conversationId={conversationId}
          existingIds={new Set((data?.members ?? []).map((m) => m.user_id))}
          onAdded={refresh}
        />
      </SheetContent>
    </Sheet>
  );
}

function EditGroupDialog({
  open, onOpenChange, conversationId, initialName, initialDescription, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; conversationId: string;
  initialName: string; initialDescription: string; onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { error } = await supabase.from("conversations")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", conversationId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Group updated");
    onSaved(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) { setName(initialName); setDescription(initialDescription); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
          <DialogDescription>Update the group name and description.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({
  open, onOpenChange, conversationId, existingIds, onAdded,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; conversationId: string;
  existingIds: Set<string>; onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data: people = [] } = useQuery({
    queryKey: ["all-people-add"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,username,avatar_url").order("display_name").limit(200);
      return (data ?? []) as Profile[];
    },
  });

  const filtered = people.filter((p) => {
    if (existingIds.has(p.id)) return false;
    const s = q.toLowerCase().replace(/^@/, "");
    return !s || p.display_name.toLowerCase().includes(s) || (p.username ?? "").toLowerCase().includes(s);
  });

  const toggle = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const add = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const rows = Array.from(selected).map((uid) => ({ conversation_id: conversationId, user_id: uid, role: "member" as const }));
    const { error } = await supabase.from("conversation_members").insert(rows);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${rows.length} member${rows.length === 1 ? "" : "s"}`);
    setSelected(new Set()); setQ("");
    onAdded(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected(new Set()); setQ(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
          <DialogDescription>Pick people to add{selected.size ? ` · ${selected.size} selected` : ""}.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No people to add.</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => {
                const on = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => toggle(p.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${on ? "bg-primary/10" : "hover:bg-accent"}`}
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
          <Button onClick={add} disabled={busy || selected.size === 0}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
