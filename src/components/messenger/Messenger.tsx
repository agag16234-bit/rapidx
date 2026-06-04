import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { formatDistanceToNowStrict } from "date-fns";
import { MessageCircle, Send, Plus, LogOut, Search, ArrowLeft, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";

type Profile = { id: string; display_name: string; avatar_url: string | null; status: string | null };
type ConversationRow = {
  id: string; is_group: boolean; name: string | null; last_message_at: string;
};
type ConversationListItem = ConversationRow & {
  other: Profile | null;
  members: Profile[];
  last_message?: { content: string; sender_id: string } | null;
};
type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string };

export function Messenger({ user }: { user: User }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileShowList, setMobileShowList] = useState(true);

  return (
    <div className="flex h-[100dvh] bg-background text-foreground">
      <aside className={`${mobileShowList ? "flex" : "hidden"} md:flex w-full md:w-[360px] flex-col border-r bg-sidebar`}>
        <ChatList
          userId={user.id}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setMobileShowList(false); }}
        />
      </aside>
      <main className={`${mobileShowList ? "hidden" : "flex"} md:flex flex-1 flex-col bg-chat-pattern`}>
        {activeId ? (
          <ChatView
            conversationId={activeId}
            user={user}
            onBack={() => setMobileShowList(true)}
          />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-primary text-white shadow-elevated">
        <MessageCircle className="h-9 w-9" />
      </div>
      <h2 className="text-2xl font-bold">Welcome to Pulse</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Select a conversation or start a new one to begin chatting.
      </p>
    </div>
  );
}

/* --------------------------------- LIST --------------------------------- */

function ChatList({
  userId, activeId, onSelect,
}: { userId: string; activeId: string | null; onSelect: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data: me } = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data as Profile | null;
    },
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", userId],
    queryFn: async () => {
      const { data: memberRows } = await supabase
        .from("conversation_members").select("conversation_id").eq("user_id", userId);
      const ids = (memberRows ?? []).map((r) => r.conversation_id);
      if (!ids.length) return [] as ConversationListItem[];

      const { data: convs } = await supabase
        .from("conversations").select("*").in("id", ids).order("last_message_at", { ascending: false });

      const { data: allMembers } = await supabase
        .from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids);

      const otherIds = Array.from(new Set((allMembers ?? []).map((m) => m.user_id)));
      const { data: profiles } = await supabase
        .from("profiles").select("*").in("id", otherIds);
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

      const { data: lastMsgs } = await supabase
        .from("messages").select("conversation_id,content,sender_id,created_at")
        .in("conversation_id", ids).order("created_at", { ascending: false });
      const lastMap = new Map<string, { content: string; sender_id: string }>();
      for (const m of lastMsgs ?? []) {
        if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, { content: m.content, sender_id: m.sender_id });
      }

      return (convs ?? []).map((c) => {
        const members = (allMembers ?? [])
          .filter((m) => m.conversation_id === c.id)
          .map((m) => profileMap.get(m.user_id))
          .filter(Boolean) as Profile[];
        const other = c.is_group ? null : members.find((p) => p.id !== userId) ?? null;
        return { ...c, members, other, last_message: lastMap.get(c.id) ?? null } as ConversationListItem;
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, userId]);

  const filtered = conversations.filter((c) => {
    const label = c.is_group ? c.name ?? "Group" : c.other?.display_name ?? "";
    return label.toLowerCase().includes(q.toLowerCase());
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  };

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarImage src={me?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gradient-primary text-white">
              {(me?.display_name ?? "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold leading-tight">{me?.display_name ?? "You"}</div>
            <div className="text-xs text-muted-foreground">Online</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NewChatDialog userId={userId} onCreated={(id) => onSelect(id)} />
          <Button size="icon" variant="ghost" onClick={handleSignOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
              const avatar = c.is_group ? null : c.other?.avatar_url;
              const active = c.id === activeId;
              const preview = c.last_message?.content ?? (c.is_group ? "New group" : "Say hi 👋");
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      active ? "bg-primary/10" : "hover:bg-sidebar-accent"
                    }`}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={avatar ?? undefined} />
                      <AvatarFallback className={c.is_group ? "bg-accent text-primary" : "bg-gradient-primary text-white"}>
                        {c.is_group ? <Users className="h-5 w-5" /> : title.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{title}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(c.last_message_at), { addSuffix: false })}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{preview}</p>
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

  const filtered = people.filter((p) => p.display_name.toLowerCase().includes(q.toLowerCase()));

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
          <DialogDescription>Pick someone to chat with.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No other users yet. Invite a friend!</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button onClick={() => startChat(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {p.display_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.display_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.status ?? "Available"}</div>
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

/* ---------------------------------- VIEW ---------------------------------- */

function ChatView({ conversationId, user, onBack }: { conversationId: string; user: User; onBack: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: header } = useQuery({
    queryKey: ["conv-header", conversationId, user.id],
    queryFn: async () => {
      const { data: conv } = await supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle();
      const { data: members } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId);
      const otherIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
      const { data: profs } = await supabase.from("profiles").select("*").in("id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);
      const other = (profs ?? [])[0] as Profile | undefined;
      return {
        title: conv?.is_group ? conv?.name ?? "Group" : other?.display_name ?? "Chat",
        subtitle: conv?.is_group ? `${(members ?? []).length} members` : other?.status ?? "Available",
        avatar: conv?.is_group ? null : other?.avatar_url ?? null,
        is_group: !!conv?.is_group,
      };
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at");
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as Message;
          qc.setQueryData<Message[]>(["messages", conversationId], (old = []) => {
            if (old.some((m) => m.id === msg.id)) return old;
            return [...old, msg];
          });
          qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc, user.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b bg-card/80 px-4 py-3 backdrop-blur">
        <Button size="icon" variant="ghost" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={header?.avatar ?? undefined} />
          <AvatarFallback className={header?.is_group ? "bg-accent text-primary" : "bg-gradient-primary text-white"}>
            {header?.is_group ? <Users className="h-5 w-5" /> : (header?.title ?? "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{header?.title ?? "Loading…"}</div>
          <div className="truncate text-xs text-muted-foreground">{header?.subtitle}</div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {messages.length === 0 && (
            <div className="my-12 text-center text-sm text-muted-foreground">
              No messages yet. Say hi 👋
            </div>
          )}
          {messages.map((m, i) => {
            const mine = m.sender_id === user.id;
            const prev = messages[i - 1];
            const sameAuthorAsPrev = prev && prev.sender_id === m.sender_id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} ${sameAuthorAsPrev ? "mt-0.5" : "mt-3"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-bubble ${
                    mine
                      ? "rounded-br-md bg-bubble-out text-bubble-out-foreground"
                      : "rounded-bl-md bg-bubble-in text-bubble-in-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <div className={`mt-0.5 text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"} text-right`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t bg-card/80 px-3 py-3 backdrop-blur">
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="rounded-full border-transparent bg-muted/70 focus-visible:bg-card"
        />
        <Button type="submit" size="icon" disabled={!text.trim()} className="h-10 w-10 shrink-0 rounded-full bg-gradient-primary text-white hover:opacity-95">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
