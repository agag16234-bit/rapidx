import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/messenger/Media";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { uploadToBucket } from "@/lib/storage";
import { toast } from "sonner";
import {
  Crown, Shield, UserMinus, Volume2, VolumeX, Ban, ShieldOff, Link2, Copy, Trash2, ImagePlus, Save,
  Settings as SettingsIcon, Users, RotateCcw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Profile = { id: string; display_name: string; username: string | null; avatar_url: string | null };
type Member = { user_id: string; role: "owner" | "admin" | "member"; muted_until: string | null };

export function GroupSettingsSheet({
  conversationId, userId, open, onOpenChange, onDeleted,
}: {
  conversationId: string; userId: string;
  open: boolean; onOpenChange: (v: boolean) => void; onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["group-settings", conversationId],
    enabled: open,
    queryFn: async () => {
      const [{ data: conv }, { data: mems }, { data: bans }, { data: invites }] = await Promise.all([
        supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(),
        supabase.from("conversation_members").select("user_id,role,muted_until").eq("conversation_id", conversationId),
        supabase.from("conversation_bans").select("user_id,banned_at,banned_by").eq("conversation_id", conversationId),
        supabase.from("conversation_invites").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }),
      ]);
      const userIds = Array.from(new Set([...(mems ?? []).map((m) => m.user_id), ...(bans ?? []).map((b) => b.user_id)]));
      const { data: profs } = await supabase
        .from("profiles").select("id,display_name,username,avatar_url")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      return {
        conv,
        members: (mems ?? []).map((m) => ({ ...(m as Member), profile: map.get(m.user_id) ?? null })),
        bans: (bans ?? []).map((b) => ({ ...b, profile: map.get(b.user_id) ?? null })),
        invites: invites ?? [],
      };
    },
  });

  useEffect(() => {
    if (!data?.conv) return;
    setName(data.conv.name ?? "");
    setDescription(data.conv.description ?? "");
    setAvatarPath(data.conv.avatar_url ?? null);
  }, [data?.conv?.id]);

  const myRole = data?.members.find((m) => m.user_id === userId)?.role;
  const canEdit = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const sortedMembers = useMemo(() => {
    const order = { owner: 0, admin: 1, member: 2 } as const;
    return [...(data?.members ?? [])].sort(
      (a, b) => order[a.role] - order[b.role] || (a.profile?.display_name ?? "").localeCompare(b.profile?.display_name ?? ""),
    );
  }, [data?.members]);

  const saveMeta = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSavingMeta(true);
    const { error } = await supabase.from("conversations")
      .update({ name: name.trim(), description: description.trim() || null, avatar_url: avatarPath })
      .eq("id", conversationId);
    setSavingMeta(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Group updated");
    refetch();
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5 MB)"); return; }
    setUploadingAvatar(true);
    try {
      const path = await uploadToBucket("avatars", file, userId);
      setAvatarPath(path);
      toast.success("Avatar uploaded — click Save to apply");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally { setUploadingAvatar(false); }
  };

  const setRole = async (uid: string, role: "admin" | "member" | "owner") => {
    const { error } = await supabase.from("conversation_members").update({ role }).eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated");
    refetch();
  };

  const removeMember = async (uid: string) => {
    const { error } = await supabase.from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Member removed");
    refetch();
  };

  const muteFor = async (uid: string, minutes: number | null) => {
    const until = minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
    const { error } = await supabase.from("conversation_members").update({ muted_until: until }).eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success(minutes === null ? "Unmuted" : `Muted for ${minutes < 60 ? minutes + "m" : minutes / 60 + "h"}`);
    refetch();
  };

  const banUser = async (uid: string) => {
    if (!confirm("Ban this user? They will be removed and cannot rejoin via invite.")) return;
    const { error: e1 } = await supabase.from("conversation_bans")
      .insert({ conversation_id: conversationId, user_id: uid, banned_by: userId });
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", uid);
    toast.success("Banned");
    refetch();
  };

  const unbanUser = async (uid: string) => {
    const { error } = await supabase.from("conversation_bans").delete().eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Unbanned");
    refetch();
  };

  const createInvite = async () => {
    const { data: row, error } = await supabase.from("conversation_invites")
      .insert({ conversation_id: conversationId, created_by: userId })
      .select().single();
    if (error || !row) { toast.error(error?.message ?? "Failed"); return; }
    const link = `${window.location.origin}/chats?ginvite=${encodeURIComponent(row.token)}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Invite link created & copied");
    refetch();
  };

  const copyInvite = async (token: string) => {
    const link = `${window.location.origin}/chats?ginvite=${encodeURIComponent(token)}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Link copied");
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from("conversation_invites").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refetch();
  };

  const deleteGroup = async () => {
    if (!confirm("Delete this group permanently? This cannot be undone.")) return;
    const { error } = await supabase.from("conversations").delete().eq("id", conversationId);
    if (error) { toast.error(error.message); return; }
    toast.success("Group deleted");
    onOpenChange(false);
    onDeleted?.();
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
  };

  if (!canEdit) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md glass-strong">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Only admins and the owner can access group settings.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto glass-strong">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5" /> Group settings</SheetTitle>
          <SheetDescription>Manage information, members, invites, and access.</SheetDescription>
        </SheetHeader>

        {/* INFO */}
        <section className="mt-6 space-y-4 rounded-3xl border bg-card/50 p-4">
          <h4 className="text-sm font-semibold">Group information</h4>
          <div className="flex items-center gap-4">
            <AvatarPreview path={avatarPath} name={name || "G"} />
            <div className="flex flex-col gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={uploadingAvatar}>
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                {uploadingAvatar ? "Uploading…" : "Change avatar"}
              </Button>
              {avatarPath && (
                <Button size="sm" variant="ghost" className="rounded-full text-xs" onClick={() => setAvatarPath(null)}>
                  Remove avatar
                </Button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="rounded-2xl" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={280} className="rounded-2xl" />
          </div>
          <Button onClick={saveMeta} disabled={savingMeta} className="rounded-full bg-gradient-primary text-white">
            <Save className="mr-1.5 h-4 w-4" />{savingMeta ? "Saving…" : "Save changes"}
          </Button>
        </section>

        {/* MEMBERS */}
        <section className="mt-6 space-y-3 rounded-3xl border bg-card/50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Members ({sortedMembers.length})</h4>
          <ul className="space-y-1">
            {sortedMembers.map((m) => {
              const isMe = m.user_id === userId;
              const canManage = !isMe && m.role !== "owner";
              const muted = m.muted_until && new Date(m.muted_until) > new Date();
              return (
                <li key={m.user_id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-accent/60">
                  <UserAvatar path={m.profile?.avatar_url} name={m.profile?.display_name ?? "?"} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{m.profile?.display_name ?? "Unknown"}{isMe && " (you)"}</span>
                      {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                      {m.role === "admin" && <Shield className="h-3.5 w-3.5 text-primary" />}
                      {muted && <VolumeX className="h-3.5 w-3.5 text-rose-500" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{m.profile?.username ?? "user"} · {m.role}{muted ? ` · muted until ${new Date(m.muted_until!).toLocaleString()}` : ""}
                    </div>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="rounded-full">Manage</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-strong rounded-2xl">
                        {m.role === "member" ? (
                          <DropdownMenuItem onClick={() => setRole(m.user_id, "admin")}>
                            <Shield className="mr-2 h-4 w-4" /> Promote to admin
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setRole(m.user_id, "member")}>
                            <ShieldOff className="mr-2 h-4 w-4" /> Remove admin
                          </DropdownMenuItem>
                        )}
                        {isOwner && (
                          <DropdownMenuItem onClick={() => setRole(m.user_id, "owner")}>
                            <Crown className="mr-2 h-4 w-4" /> Transfer ownership
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {muted ? (
                          <DropdownMenuItem onClick={() => muteFor(m.user_id, null)}>
                            <Volume2 className="mr-2 h-4 w-4" /> Unmute
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={() => muteFor(m.user_id, 60)}>
                              <VolumeX className="mr-2 h-4 w-4" /> Mute 1 hour
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => muteFor(m.user_id, 24 * 60)}>
                              <VolumeX className="mr-2 h-4 w-4" /> Mute 24 hours
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => muteFor(m.user_id, 7 * 24 * 60)}>
                              <VolumeX className="mr-2 h-4 w-4" /> Mute 7 days
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => removeMember(m.user_id)}>
                          <UserMinus className="mr-2 h-4 w-4" /> Remove from group
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => banUser(m.user_id)}>
                          <Ban className="mr-2 h-4 w-4" /> Ban
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* BANS */}
        {data?.bans && data.bans.length > 0 && (
          <section className="mt-6 space-y-2 rounded-3xl border bg-card/50 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Ban className="h-4 w-4" /> Banned ({data.bans.length})</h4>
            <ul className="space-y-1">
              {data.bans.map((b) => (
                <li key={b.user_id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-accent/60">
                  <UserAvatar path={b.profile?.avatar_url} name={b.profile?.display_name ?? "?"} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{b.profile?.display_name ?? "Unknown"}</div>
                    <div className="truncate text-xs text-muted-foreground">@{b.profile?.username ?? "user"} · banned {new Date(b.banned_at).toLocaleDateString()}</div>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => unbanUser(b.user_id)}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Unban
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* INVITES */}
        <section className="mt-6 space-y-3 rounded-3xl border bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Invite links</h4>
            <Button size="sm" onClick={createInvite} className="rounded-full bg-gradient-primary text-white">
              Generate link
            </Button>
          </div>
          {data?.invites && data.invites.length > 0 ? (
            <ul className="space-y-1">
              {data.invites.map((inv: any) => (
                <li key={inv.id} className="flex items-center gap-2 rounded-2xl bg-background/60 px-3 py-2">
                  <code className="flex-1 truncate text-xs">{`${window.location.origin}/chats?ginvite=${inv.token}`}</code>
                  <span className="text-[10px] text-muted-foreground">{inv.uses} uses</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => copyInvite(inv.token)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full text-destructive" onClick={() => revokeInvite(inv.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No invite links yet.</p>
          )}
        </section>

        {/* DANGER */}
        {isOwner && (
          <section className="mt-6 space-y-2 rounded-3xl border border-destructive/40 bg-destructive/5 p-4">
            <h4 className="text-sm font-semibold text-destructive">Danger zone</h4>
            <p className="text-xs text-muted-foreground">Permanently delete this group and all its messages.</p>
            <Button variant="destructive" className="w-full rounded-full" onClick={deleteGroup}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete group
            </Button>
          </section>
        )}

        <Separator className="my-6" />
      </SheetContent>
    </Sheet>
  );
}

function AvatarPreview({ path, name }: { path: string | null; name: string }) {
  const { data: url } = useSignedUrl("avatars", path);
  if (url) {
    return <img src={url} alt={name} className="h-16 w-16 rounded-2xl object-cover shadow-elevated" />;
  }
  return (
    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary text-white shadow-elevated">
      <span className="text-lg font-bold">{(name || "G").charAt(0).toUpperCase()}</span>
    </div>
  );
}
