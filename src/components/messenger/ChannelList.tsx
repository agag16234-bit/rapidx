import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Megaphone, Users, Pin } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

type ChannelItem = {
  id: string; name: string; slug: string | null; avatar_url: string | null;
  is_public: boolean; subscriber_count: number; role: string;
  last_post: { content: string | null; created_at: string; media_type: string | null } | null;
};

export function ChannelList({ userId, activeId, onSelect }: {
  userId: string; activeId: string | null; onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["channels", userId],
    queryFn: async () => {
      const { data: memberships } = await supabase.from("channel_members").select("channel_id,role").eq("user_id", userId);
      const ids = (memberships ?? []).map((m) => m.channel_id);
      if (!ids.length) return [] as ChannelItem[];
      const roleMap = new Map((memberships ?? []).map((m) => [m.channel_id, m.role]));
      const { data: channels } = await supabase.from("channels").select("*").in("id", ids);
      const { data: lastPosts } = await supabase.from("channel_posts").select("channel_id,content,created_at,media_type").in("channel_id", ids).order("created_at", { ascending: false });
      const lastMap = new Map<string, any>();
      for (const p of (lastPosts ?? [])) if (!lastMap.has(p.channel_id)) lastMap.set(p.channel_id, p);
      return (channels ?? []).map((c) => ({
        ...c, role: roleMap.get(c.id) ?? "subscriber", last_post: lastMap.get(c.id) ?? null,
      })) as ChannelItem[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("channel-list-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members" },
        () => qc.invalidateQueries({ queryKey: ["channels", userId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_posts" },
        () => qc.invalidateQueries({ queryKey: ["channels", userId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, userId]);

  return (
    <ScrollArea className="flex-1 px-2 py-3 scrollbar-thin">
      {items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>No channels yet.</p>
          <p className="mt-1">Create one or discover public channels.</p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((c) => {
            const active = c.id === activeId;
            const preview = previewText(c.last_post);
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    active ? "bg-primary/15 shadow-bubble" : "hover:bg-sidebar-accent"
                  }`}
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white shadow-bubble">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.name}</span>
                      {c.last_post && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(c.last_post.created_at))}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">{preview}</p>
                      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Users className="h-3 w-3" />{c.subscriber_count}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ScrollArea>
  );
}

function previewText(p: any): string {
  if (!p) return "No posts yet";
  if (p.media_type === "image") return "📷 Photo";
  if (p.media_type === "video") return "🎬 Video";
  if (p.media_type === "audio") return "🎙 Voice";
  if (p.media_type === "file") return "📎 File";
  return p.content || "…";
}

void Pin;
