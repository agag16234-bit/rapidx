import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Paperclip, Eye, Pin, Trash2, Edit3, MoreVertical, Link2, LogOut, Megaphone, Users, Settings as SettingsIcon } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { uploadToBucket, detectMediaType } from "@/lib/storage";
import { MediaImage, MediaVideo, MediaAudio, MediaFile } from "@/components/messenger/Media";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ChannelSettingsSheet } from "@/components/messenger/ChannelSettingsSheet";

type Channel = { id: string; name: string; slug: string | null; description: string | null; avatar_url: string | null; is_public: boolean; subscriber_count: number; created_by: string };
type Post = {
  id: string; channel_id: string; author_id: string; content: string | null;
  media_url: string | null; media_type: string | null; media_name: string | null; media_size: number | null;
  pinned: boolean; view_count: number; edited_at: string | null; created_at: string;
};

export function ChannelView({ channelId, userId, onBack, onLeft }: {
  channelId: string; userId: string; onBack: () => void; onLeft: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: channel } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => {
      const { data } = await supabase.from("channels").select("*").eq("id", channelId).maybeSingle();
      return data as Channel | null;
    },
  });

  const { data: membership } = useQuery({
    queryKey: ["channel-membership", channelId, userId],
    queryFn: async () => {
      const { data } = await supabase.from("channel_members").select("role").eq("channel_id", channelId).eq("user_id", userId).maybeSingle();
      return data;
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["channel-posts", channelId],
    queryFn: async () => {
      const { data } = await supabase.from("channel_posts").select("*").eq("channel_id", channelId).order("created_at", { ascending: true });
      return (data ?? []) as Post[];
    },
  });

  const isAdmin = membership?.role === "owner" || membership?.role === "admin";
  const isOwner = membership?.role === "owner";

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`channel-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_posts", filter: `channel_id=eq.${channelId}` },
        () => { qc.invalidateQueries({ queryKey: ["channel-posts", channelId] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members", filter: `channel_id=eq.${channelId}` },
        () => { qc.invalidateQueries({ queryKey: ["channel", channelId] }); qc.invalidateQueries({ queryKey: ["channels", userId] }); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channels", filter: `id=eq.${channelId}` },
        () => { qc.invalidateQueries({ queryKey: ["channel", channelId] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [posts.length]);

  // Record views (admins always seen)
  useEffect(() => {
    const unseen = posts.filter((p) => p.author_id !== userId);
    if (!unseen.length) return;
    (async () => {
      const rows = unseen.map((p) => ({ post_id: p.id, user_id: userId }));
      await supabase.from("channel_post_views").upsert(rows, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    })();
  }, [posts, userId]);

  const pinned = useMemo(() => posts.find((p) => p.pinned) ?? null, [posts]);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    const { error } = await supabase.from("channel_posts").insert({ channel_id: channelId, author_id: userId, content });
    if (error) toast.error(error.message);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("File too large (max 50 MB)"); return; }
    setUploading(true);
    try {
      const path = await uploadToBucket("chat-media", file, userId);
      const type = detectMediaType(file);
      const { error } = await supabase.from("channel_posts").insert({
        channel_id: channelId, author_id: userId, content: text.trim() || null,
        media_url: path, media_type: type, media_name: file.name, media_size: file.size,
      });
      if (error) throw error;
      setText("");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally { setUploading(false); }
  };

  const togglePin = async (post: Post) => {
    if (post.pinned) {
      await supabase.from("channel_posts").update({ pinned: false }).eq("id", post.id);
    } else {
      // unpin others first
      await supabase.from("channel_posts").update({ pinned: false }).eq("channel_id", channelId).eq("pinned", true);
      await supabase.from("channel_posts").update({ pinned: true }).eq("id", post.id);
    }
  };

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("channel_posts").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const startEdit = (p: Post) => { setEditingId(p.id); setEditText(p.content ?? ""); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("channel_posts").update({ content: editText, edited_at: new Date().toISOString() }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
  };

  const leaveChannel = async () => {
    if (isOwner) { toast.error("Owners must delete the channel instead."); return; }
    await supabase.from("channel_members").delete().eq("channel_id", channelId).eq("user_id", userId);
    toast.success("Left channel");
    onLeft();
  };

  const deleteChannel = async () => {
    if (!confirm("Delete this channel and all posts?")) return;
    const { error } = await supabase.from("channels").delete().eq("id", channelId);
    if (error) { toast.error(error.message); return; }
    toast.success("Channel deleted");
    onLeft();
  };

  const createInvite = async () => {
    const { data, error } = await supabase.from("channel_invites").insert({ channel_id: channelId, created_by: userId }).select().single();
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    const link = `${window.location.origin}/chats?invite=${data.token}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Invite link copied!");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="glass flex items-center gap-3 border-b px-4 py-3">
        <Button size="icon" variant="ghost" className="md:hidden rounded-full" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-elevated">
          <Megaphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate font-display text-sm font-bold">{channel?.name ?? "Channel"}</div>
            {!channel?.is_public && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase">Private</span>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{channel?.subscriber_count ?? 0} subscriber{channel?.subscriber_count === 1 ? "" : "s"}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="rounded-full"><MoreVertical className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong rounded-2xl">
            {isAdmin && (
              <DropdownMenuItem onClick={createInvite}><Link2 className="mr-2 h-4 w-4" />Invite link</DropdownMenuItem>
            )}
            {!isOwner && (
              <DropdownMenuItem onClick={leaveChannel}><LogOut className="mr-2 h-4 w-4" />Leave channel</DropdownMenuItem>
            )}
            {isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={deleteChannel} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete channel</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {channel?.description && (
        <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{channel.description}</div>
      )}

      {pinned && (
        <div className="border-b glass px-4 py-2 flex items-start gap-2">
          <Pin className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" />
          <div className="text-xs">
            <span className="font-semibold">Pinned · </span>
            <span className="text-muted-foreground line-clamp-2">{pinned.content || pinned.media_name}</span>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {posts.length === 0 && (
            <div className="my-12 text-center text-sm text-muted-foreground">
              {isAdmin ? "No posts yet. Publish your first one ✨" : "Nothing here yet."}
            </div>
          )}
          {posts.map((p) => (
            <article key={p.id} className="glass-strong rounded-3xl p-4 shadow-bubble">
              {p.media_type === "image" && p.media_url && (
                <div className="mb-3 overflow-hidden rounded-2xl"><MediaImage path={p.media_url} alt={p.media_name ?? ""} /></div>
              )}
              {p.media_type === "video" && p.media_url && (
                <div className="mb-3 overflow-hidden rounded-2xl"><MediaVideo path={p.media_url} /></div>
              )}
              {p.media_type === "audio" && p.media_url && (
                <div className="mb-3"><MediaAudio path={p.media_url} /></div>
              )}
              {p.media_type === "file" && p.media_url && (
                <div className="mb-3"><MediaFile path={p.media_url} name={p.media_name ?? "File"} size={p.media_size} /></div>
              )}
              {editingId === p.id ? (
                <div className="space-y-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} className="rounded-2xl" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="rounded-full">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="rounded-full">Cancel</Button>
                  </div>
                </div>
              ) : p.content ? (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{p.content}</p>
              ) : null}
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>{formatDistanceToNowStrict(new Date(p.created_at), { addSuffix: true })}</span>
                  {p.edited_at && <span>· edited</span>}
                  {p.pinned && <span className="flex items-center gap-1 text-primary"><Pin className="h-3 w-3" />pinned</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{p.view_count}</span>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-full p-1 hover:bg-accent"><MoreVertical className="h-3.5 w-3.5" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-strong rounded-2xl">
                        <DropdownMenuItem onClick={() => togglePin(p)}><Pin className="mr-2 h-4 w-4" />{p.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startEdit(p)}><Edit3 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deletePost(p.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {isAdmin ? (
        <form onSubmit={publish} className="glass flex items-center gap-2 border-t px-3 py-3">
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
                 accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
          <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={uploading ? "Uploading…" : "Publish to channel…"}
            className="rounded-full border-transparent bg-muted/70"
            disabled={uploading}
          />
          <Button type="submit" size="icon" disabled={!text.trim()} className="h-10 w-10 shrink-0 rounded-full bg-gradient-primary text-white">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <div className="border-t glass px-4 py-3 text-center text-xs text-muted-foreground">
          Only admins can post in this channel
        </div>
      )}
    </div>
  );
}
