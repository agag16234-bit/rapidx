import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import {
  MessageCircle, Send, Plus, LogOut, Search, ArrowLeft, Users, Paperclip,
  Smile, Check, CheckCheck, Sun, Moon, UserCog, X, UsersRound, Info, Megaphone,
} from "lucide-react";
import { AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { useTheme } from "@/components/theme-provider";
import { ProfileSheet } from "@/components/messenger/ProfileSheet";
import { UserAvatar, MediaImage, MediaVideo, MediaAudio, MediaFile } from "@/components/messenger/Media";
import { uploadToBucket, detectMediaType } from "@/lib/storage";
import { GroupCreateDialog } from "@/components/messenger/GroupCreateDialog";
import { GroupInfoSheet } from "@/components/messenger/GroupInfoSheet";
import { ChannelCreateDialog } from "@/components/messenger/ChannelCreateDialog";
import { ChannelDiscover } from "@/components/messenger/ChannelDiscover";
import { ChannelList } from "@/components/messenger/ChannelList";
import { ChannelView } from "@/components/messenger/ChannelView";

type Profile = {
  id: string; display_name: string; username: string | null; avatar_url: string | null;
  status: string | null; bio: string | null; last_seen: string | null; show_last_seen: boolean | null;
};
type ConversationRow = { id: string; is_group: boolean; name: string | null; last_message_at: string };
type ConversationListItem = ConversationRow & {
  other: Profile | null; members: Profile[]; last_message?: Message | null; unread: number;
};
type Message = {
  id: string; conversation_id: string; sender_id: string; content: string; created_at: string;
  media_url: string | null; media_type: string | null; media_name: string | null;
  media_mime: string | null; media_size: number | null;
};
type Reaction = { id: string; message_id: string; user_id: string; emoji: string };

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢"];

export function Messenger({ user }: { user: User }) {
  const [tab, setTab] = useState<"chats" | "channels">("chats");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [mobileShowList, setMobileShowList] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Handle ?invite=token (channel) or ?ginvite=token (group) from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channelToken = params.get("invite");
    const groupToken = params.get("ginvite");
    if (!channelToken && !groupToken) return;
    (async () => {
      if (channelToken) {
        const { data, error } = await supabase.rpc("join_channel_by_invite", { _token: channelToken });
        window.history.replaceState({}, "", window.location.pathname);
        if (error || !data) { toast.error(error?.message ?? "Invalid invite"); return; }
        toast.success("Joined channel");
        setTab("channels");
        setActiveChannelId(data as string);
        setMobileShowList(false);
      } else if (groupToken) {
        const { data, error } = await supabase.rpc("join_conversation_by_invite", { _token: groupToken });
        window.history.replaceState({}, "", window.location.pathname);
        if (error || !data) { toast.error(error?.message ?? "Invalid invite"); return; }
        toast.success("Joined group");
        setTab("chats");
        setActiveChatId(data as string);
        setMobileShowList(false);
      }
    })();
  }, []);

  // Global presence channel
  useEffect(() => {
    const channel = supabase.channel("online-presence", { config: { presence: { key: user.id } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const ids = new Set(Object.keys(state));
      setOnlineUserIds(ids);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    const heartbeat = setInterval(() => {
      supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id);
    }, 60_000);
    supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id);

    return () => { clearInterval(heartbeat); supabase.removeChannel(channel); };
  }, [user.id]);

  

  return (
    <div className="flex h-[100dvh] text-foreground">
      <aside className={`${mobileShowList ? "flex" : "hidden"} md:flex w-full md:w-[380px] flex-col border-r glass`}>
        <SidebarHeader user={user} tab={tab} setTab={(t) => setTab(t)}
          onChatCreated={(id) => { setActiveChatId(id); setTab("chats"); setMobileShowList(false); }}
          onChannelCreated={(id) => { setActiveChannelId(id); setTab("channels"); setMobileShowList(false); }}
        />
        {tab === "chats" ? (
          <ChatList
            user={user}
            activeId={activeChatId}
            onlineUserIds={onlineUserIds}
            onSelect={(id) => { setActiveChatId(id); setMobileShowList(false); }}
          />
        ) : (
          <ChannelList
            userId={user.id}
            activeId={activeChannelId}
            onSelect={(id) => { setActiveChannelId(id); setMobileShowList(false); }}
          />
        )}
      </aside>
      <main className={`${mobileShowList ? "hidden" : "flex"} md:flex flex-1 flex-col bg-chat-pattern`}>
        {tab === "chats" && activeChatId ? (
          <ChatView
            conversationId={activeChatId}
            user={user}
            onlineUserIds={onlineUserIds}
            onBack={() => setMobileShowList(true)}
          />
        ) : tab === "channels" && activeChannelId ? (
          <ChannelView
            channelId={activeChannelId}
            userId={user.id}
            onBack={() => setMobileShowList(true)}
            onLeft={() => { setActiveChannelId(null); setMobileShowList(true); }}
          />
        ) : (
          <EmptyState tab={tab} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ tab }: { tab: "chats" | "channels" }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 grid h-24 w-24 place-items-center rounded-3xl bg-gradient-primary text-white shadow-elevated">
        {tab === "chats" ? <MessageCircle className="h-10 w-10" /> : <Megaphone className="h-10 w-10" />}
      </div>
      <h2 className="font-display text-3xl font-bold">Welcome to Premium Chat</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {tab === "chats"
          ? "Select a conversation or start a new one to begin chatting."
          : "Select a channel, create your own, or discover public broadcasts."}
      </p>
    </div>
  );
}

function SidebarHeader({ user, tab, setTab, onChatCreated, onChannelCreated }: {
  user: User; tab: "chats" | "channels"; setTab: (t: "chats" | "channels") => void;
  onChatCreated: (id: string) => void; onChannelCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const userId = user.id;
  const { data: me } = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data as Profile | null;
    },
  });

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-4">
        <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2.5 rounded-2xl p-1 hover:bg-sidebar-accent">
          <UserAvatar path={me?.avatar_url} name={me?.display_name ?? "U"} className="h-11 w-11 ring-2 ring-primary/30" />
          <div className="text-left">
            <div className="font-display text-sm font-bold leading-tight">{me?.display_name ?? "You"}</div>
            <div className="text-xs text-muted-foreground">@{me?.username ?? "you"}</div>
          </div>
        </button>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" onClick={toggle} title="Toggle theme" className="rounded-full">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {tab === "chats" ? (
            <>
              <NewGroupButton userId={userId} onCreated={onChatCreated} />
              <NewChatDialog userId={userId} onCreated={onChatCreated} />
            </>
          ) : (
            <>
              <ChannelDiscover userId={userId} onJoined={onChannelCreated} />
              <ChannelCreateDialog userId={userId} onCreated={onChannelCreated} />
            </>
          )}
          <a href="/bots" title="BotFather" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent">
            <Bot className="h-4 w-4" />
          </a>
          <Button size="icon" variant="ghost" onClick={() => setProfileOpen(true)} title="Profile" className="rounded-full">
            <UserCog className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleSignOut} title="Sign out" className="rounded-full">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted/60 p-1">
          <button
            onClick={() => setTab("chats")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === "chats" ? "bg-gradient-primary text-white shadow-bubble" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="mr-1 inline h-3.5 w-3.5" />Chats
          </button>
          <button
            onClick={() => setTab("channels")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === "channels" ? "bg-gradient-primary text-white shadow-bubble" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Megaphone className="mr-1 inline h-3.5 w-3.5" />Channels
          </button>
        </div>
      </div>
      <ProfileSheet user={user} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}

/* --------------------------------- LIST --------------------------------- */

function ChatList({
  user, activeId, onlineUserIds, onSelect,
}: { user: User; activeId: string | null; onlineUserIds: Set<string>; onSelect: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const userId = user.id;
  void user;

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", userId],
    queryFn: async () => {
      const { data: memberRows } = await supabase
        .from("conversation_members").select("conversation_id,last_read_at").eq("user_id", userId);
      const ids = (memberRows ?? []).map((r) => r.conversation_id);
      if (!ids.length) return [] as ConversationListItem[];
      const lastReadMap = new Map((memberRows ?? []).map((r) => [r.conversation_id, r.last_read_at]));

      const { data: convs } = await supabase
        .from("conversations").select("*").in("id", ids).order("last_message_at", { ascending: false });

      const { data: allMembers } = await supabase
        .from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids);

      const otherIds = Array.from(new Set((allMembers ?? []).map((m) => m.user_id)));
      const { data: profiles } = await supabase
        .from("profiles").select("*").in("id", otherIds);
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

      const { data: lastMsgs } = await supabase
        .from("messages").select("*").in("conversation_id", ids).order("created_at", { ascending: false });
      const lastMap = new Map<string, Message>();
      const unreadMap = new Map<string, number>();
      for (const m of (lastMsgs ?? []) as Message[]) {
        if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m);
        const lr = lastReadMap.get(m.conversation_id) ?? "1970-01-01T00:00:00Z";
        if (m.sender_id !== userId && new Date(m.created_at) > new Date(lr)) {
          unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) ?? 0) + 1);
        }
      }

      return (convs ?? []).map((c) => {
        const members = (allMembers ?? [])
          .filter((m) => m.conversation_id === c.id)
          .map((m) => profileMap.get(m.user_id))
          .filter(Boolean) as Profile[];
        const other = c.is_group ? null : members.find((p) => p.id !== userId) ?? null;
        return {
          ...c,
          members,
          other,
          last_message: lastMap.get(c.id) ?? null,
          unread: unreadMap.get(c.id) ?? 0,
        } as ConversationListItem;
      });
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations", userId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations", userId] });
        queryClient.invalidateQueries({ queryKey: ["me", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, userId]);

  const filtered = conversations.filter((c) => {
    const label = c.is_group ? c.name ?? "Group" : c.other?.display_name ?? "";
    const handle = c.other?.username ?? "";
    return label.toLowerCase().includes(q.toLowerCase()) || handle.toLowerCase().includes(q.toLowerCase());
  });

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <>
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 rounded-full bg-muted/60 border-transparent" placeholder="Search chats…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 py-3 scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            <p>No conversations yet.</p>
            <p className="mt-1">Tap <span className="font-semibold text-primary">＋</span> to start one.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => {
              const title = c.is_group ? c.name ?? "Group chat" : c.other?.display_name ?? "Unknown";
              const active = c.id === activeId;
              const preview = previewText(c.last_message);
              const isOnline = !c.is_group && c.other ? onlineUserIds.has(c.other.id) : false;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      active ? "bg-primary/15 shadow-bubble" : "hover:bg-sidebar-accent"
                    }`}
                  >
                    <div className="relative">
                      {c.is_group ? (
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-accent text-white shadow-bubble">
                          <Users className="h-5 w-5" />
                        </div>
                      ) : (
                        <UserAvatar path={c.other?.avatar_url} name={title} className="h-12 w-12" />
                      )}
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{title}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(c.last_message_at), { addSuffix: false })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-muted-foreground">{preview}</p>
                        {c.unread > 0 && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-primary px-1.5 text-[10px] font-bold text-white">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </>
  );
}

function previewText(m: Message | null | undefined): string {
  if (!m) return "Say hi 👋";
  if (m.media_type === "image") return "📷 Photo";
  if (m.media_type === "video") return "🎬 Video";
  if (m.media_type === "audio") return "🎙 Audio";
  if (m.media_type === "file") return `📎 ${m.media_name ?? "File"}`;
  return m.content || "…";
}

/* ----------------------------- NEW CHAT DIALOG ---------------------------- */

function NewChatDialog({ userId, onCreated }: { userId: string; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const { data: people = [] } = useQuery({
    queryKey: ["people", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").neq("id", userId).order("display_name").limit(50);
      return (data ?? []) as Profile[];
    },
  });

  const startChat = async (otherId: string) => {
    const { data, error } = await supabase.rpc("start_direct_conversation", { _other_user: otherId });
    if (error || !data) { toast.error(error?.message ?? "Could not start chat"); return; }
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
    onCreated(data as string);
    setOpen(false);
  };

  const filtered = people.filter((p) => {
    const s = q.toLowerCase().replace(/^@/, "");
    return p.display_name.toLowerCase().includes(s) || (p.username ?? "").toLowerCase().includes(s);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="New chat">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new conversation</DialogTitle>
          <DialogDescription>Search by name or @username.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No people found.</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button onClick={() => startChat(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent">
                    <UserAvatar path={p.avatar_url} name={p.display_name} className="h-10 w-10" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.display_name}</div>
                      <div className="truncate text-xs text-muted-foreground">@{p.username ?? "user"}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupButton({ userId, onCreated }: { userId: string; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="icon" variant="ghost" title="New group" onClick={() => setOpen(true)}>
        <UsersRound className="h-5 w-5" />
      </Button>
      <GroupCreateDialog userId={userId} open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

/* ---------------------------------- VIEW ---------------------------------- */

function ChatView({
  conversationId, user, onlineUserIds, onBack,
}: { conversationId: string; user: User; onlineUserIds: Set<string>; onBack: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [otherLastRead, setOtherLastRead] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);

  const { data: header } = useQuery({
    queryKey: ["conv-header", conversationId, user.id],
    queryFn: async () => {
      const { data: conv } = await supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle();
      const { data: members } = await supabase.from("conversation_members").select("user_id,last_read_at").eq("conversation_id", conversationId);
      const otherIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
      const { data: profs } = await supabase.from("profiles").select("*").in("id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);
      const other = (profs ?? [])[0] as Profile | undefined;
      return { conv, members: members ?? [], other, otherIds };
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at");
      return (data ?? []) as Message[];
    },
  });

  const { data: reactions = [] } = useQuery({
    queryKey: ["reactions", conversationId],
    queryFn: async () => {
      const { data } = await supabase.from("message_reactions").select("*").eq("conversation_id", conversationId);
      return (data ?? []) as Reaction[];
    },
  });

  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const arr = map.get(r.message_id) ?? [];
      arr.push(r);
      map.set(r.message_id, arr);
    }
    return map;
  }, [reactions]);

  // Compute other member's last_read_at (for read receipts on own messages)
  useEffect(() => {
    if (!header) return;
    const lr = header.members
      .filter((m) => m.user_id !== user.id)
      .map((m) => new Date(m.last_read_at));
    if (!lr.length) { setOtherLastRead(null); return; }
    setOtherLastRead(new Date(Math.max(...lr.map((d) => d.getTime()))));
  }, [header, user.id]);

  // Realtime: messages, reactions, member updates (for read receipts), typing broadcast
  useEffect(() => {
    const channel = supabase.channel(`conv-${conversationId}`, { config: { broadcast: { self: false } } });

    channel
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as Message;
          qc.setQueryData<Message[]>(["messages", conversationId], (old = []) => {
            if (old.some((m) => m.id === msg.id)) return old;
            return [...old, msg];
          });
          qc.invalidateQueries({ queryKey: ["conversations", user.id] });
          // If chat is open and message is from other, mark read
          if (msg.sender_id !== user.id) {
            markAsRead(conversationId, user.id);
          }
        },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` },
        () => { qc.invalidateQueries({ queryKey: ["reactions", conversationId] }); },
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
        () => { qc.invalidateQueries({ queryKey: ["conv-header", conversationId, user.id] }); },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const senderId = payload?.user_id as string | undefined;
        if (!senderId || senderId === user.id) return;
        setTypingUserIds((prev) => new Set(prev).add(senderId));
        clearTimeout(typingTimeoutRef.current[senderId]);
        typingTimeoutRef.current[senderId] = setTimeout(() => {
          setTypingUserIds((prev) => { const n = new Set(prev); n.delete(senderId); return n; });
        }, 3000);
      })
      .subscribe();

    broadcastChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); broadcastChannelRef.current = null; };
  }, [conversationId, qc, user.id]);

  // Mark read on mount
  useEffect(() => {
    markAsRead(conversationId, user.id);
  }, [conversationId, user.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingUserIds.size]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id, content,
    });
    if (error) toast.error(error.message);
  };

  const onTextChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500 && broadcastChannelRef.current) {
      lastTypingSentRef.current = now;
      broadcastChannelRef.current.send({
        type: "broadcast", event: "typing", payload: { user_id: user.id },
      });
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("File too large (max 25 MB)"); return; }
    setUploading(true);
    try {
      const path = await uploadToBucket("chat-media", file, user.id);
      const type = detectMediaType(file);
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: user.id, content: "",
        media_url: path, media_type: type, media_name: file.name, media_mime: file.type, media_size: file.size,
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const otherOnline = header?.other ? onlineUserIds.has(header.other.id) : false;
  const subtitle = useMemo(() => {
    if (!header) return "";
    if (header.conv?.is_group) return `${header.members.length} members`;
    if (!header.other) return "";
    if (typingUserIds.has(header.other.id)) return "typing…";
    if (otherOnline) return "online";
    if (header.other.show_last_seen !== false && header.other.last_seen) {
      return `last seen ${formatDistanceToNowStrict(new Date(header.other.last_seen), { addSuffix: true })}`;
    }
    return header.other.bio || "Available";
  }, [header, otherOnline, typingUserIds]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b bg-card/80 px-4 py-3 backdrop-blur">
        <Button size="icon" variant="ghost" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative">
          {header?.conv?.is_group ? (
            <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary">
              <Users className="h-5 w-5" />
            </div>
          ) : (
            <UserAvatar path={header?.other?.avatar_url} name={header?.other?.display_name ?? "?"} className="h-10 w-10" />
          )}
          {otherOnline && !header?.conv?.is_group && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
          )}
        </div>
        <button
          type="button"
          onClick={() => header?.conv?.is_group && setGroupInfoOpen(true)}
          className={`min-w-0 flex-1 text-left ${header?.conv?.is_group ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className="truncate text-sm font-semibold">
            {header?.conv?.is_group ? header.conv?.name ?? "Group" : header?.other?.display_name ?? "Loading…"}
          </div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </button>
        {header?.conv?.is_group && (
          <Button size="icon" variant="ghost" title="Group info" onClick={() => setGroupInfoOpen(true)}>
            <Info className="h-5 w-5" />
          </Button>
        )}
      </header>

      {header?.conv?.is_group && (
        <GroupInfoSheet
          conversationId={conversationId}
          userId={user.id}
          open={groupInfoOpen}
          onOpenChange={setGroupInfoOpen}
          onClosed={onBack}
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {messages.length === 0 && (
            <div className="my-12 text-center text-sm text-muted-foreground">No messages yet. Say hi 👋</div>
          )}
          {messages.map((m, i) => {
            const mine = m.sender_id === user.id;
            const prev = messages[i - 1];
            const sameAuthorAsPrev = prev && prev.sender_id === m.sender_id;
            const seen = mine && otherLastRead && otherLastRead >= new Date(m.created_at);
            return (
              <MessageRow
                key={m.id}
                msg={m}
                mine={mine}
                sameAuthorAsPrev={!!sameAuthorAsPrev}
                reactions={reactionsByMsg.get(m.id) ?? []}
                userId={user.id}
                seen={!!seen}
              />
            );
          })}
          {typingUserIds.size > 0 && header?.other && typingUserIds.has(header.other.id) && (
            <div className="mt-2 flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-bubble-in px-3.5 py-2 text-sm shadow-bubble">
                <TypingDots />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t bg-card/80 px-3 py-3 backdrop-blur">
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
               accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
        <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach">
          <Paperclip className="h-5 w-5" />
        </Button>
        <Input
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={uploading ? "Uploading…" : "Type a message…"}
          className="rounded-full border-transparent bg-muted/70 focus-visible:bg-card"
          disabled={uploading}
        />
        <Button type="submit" size="icon" disabled={!text.trim()} className="h-10 w-10 shrink-0 rounded-full bg-gradient-primary text-white hover:opacity-95">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}

/* ------------------------------ MESSAGE ROW ------------------------------ */

function MessageRow({
  msg, mine, sameAuthorAsPrev, reactions, userId, seen,
}: {
  msg: Message; mine: boolean; sameAuthorAsPrev: boolean;
  reactions: Reaction[]; userId: string; seen: boolean;
}) {
  const [reactOpen, setReactOpen] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = m.get(r.emoji) ?? { count: 0, mine: false };
      cur.count++;
      if (r.user_id === userId) cur.mine = true;
      m.set(r.emoji, cur);
    }
    return Array.from(m.entries());
  }, [reactions, userId]);

  const toggleReaction = async (emoji: string) => {
    setReactOpen(false);
    const existing = reactions.find((r) => r.user_id === userId && r.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      // Remove previous reaction by user (single reaction per user per message UX)
      const prior = reactions.find((r) => r.user_id === userId);
      if (prior) await supabase.from("message_reactions").delete().eq("id", prior.id);
      await supabase.from("message_reactions").insert({
        message_id: msg.id, conversation_id: msg.conversation_id, user_id: userId, emoji,
      });
    }
  };

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"} ${sameAuthorAsPrev ? "mt-0.5" : "mt-3"}`}>
      <div className={`flex items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
        <div
          className={`relative max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-bubble ${
            mine
              ? "rounded-br-md bg-bubble-out text-bubble-out-foreground"
              : "rounded-bl-md bg-bubble-in text-bubble-in-foreground"
          }`}
        >
          {msg.media_url && msg.media_type === "image" && (
            <div className="mb-1 overflow-hidden rounded-xl">
              <MediaImage path={msg.media_url} alt={msg.media_name ?? ""} />
            </div>
          )}
          {msg.media_url && msg.media_type === "video" && (
            <div className="mb-1"><MediaVideo path={msg.media_url} /></div>
          )}
          {msg.media_url && msg.media_type === "audio" && (
            <div className="mb-1"><MediaAudio path={msg.media_url} /></div>
          )}
          {msg.media_url && msg.media_type === "file" && (
            <div className="mb-1">
              <MediaFile path={msg.media_url} name={msg.media_name ?? "File"} size={msg.media_size} />
            </div>
          )}
          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

          <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
            <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            {mine && (seen ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
          </div>

          {grouped.length > 0 && (
            <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
              {grouped.map(([emoji, { count, mine: ownMine }]) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                    ownMine ? "bg-primary/20 text-primary" : "bg-background/40"
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Popover open={reactOpen} onOpenChange={setReactOpen}>
          <PopoverTrigger asChild>
            <button
              className="invisible rounded-full p-1 text-muted-foreground hover:bg-accent group-hover:visible"
              aria-label="React"
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-auto gap-1 p-2" side="top">
            {REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => toggleReaction(e)}
                className="rounded-full p-1.5 text-lg transition hover:scale-125"
              >
                {e}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

async function markAsRead(conversationId: string, userId: string) {
  await supabase.from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

// Silence unused-import warnings if any unused (AvatarFallback / X)
void AvatarFallback; void X;
