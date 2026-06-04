import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { MessageCircle, Zap, Lock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pulse — Chat in real time" },
      { name: "description", content: "A modern, beautiful messenger. Sign in to start chatting." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/chats" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-white shadow-elevated">
            <MessageCircle className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Pulse</span>
        </div>
        <Link to="/auth" className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition hover:opacity-90">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-12 pb-24 md:px-12 md:pt-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Real-time messaging
            </div>
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Conversations,{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">made simple.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              Pulse is a beautifully fast, modern messenger. Chat with friends, build groups,
              and stay close — wherever you are.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="rounded-full bg-gradient-primary px-7 py-3 text-sm font-semibold text-white shadow-elevated transition hover:opacity-95">
                Get started — it's free
              </Link>
              <a href="#features" className="rounded-full border bg-card px-7 py-3 text-sm font-semibold transition hover:bg-accent">
                Learn more
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-primary opacity-20 blur-3xl" />
            <div className="overflow-hidden rounded-[2rem] border bg-card p-4 shadow-elevated">
              <div className="space-y-3 bg-chat-pattern rounded-2xl p-4">
                <Bubble side="in" name="Maya">Just landed! ✈️</Bubble>
                <Bubble side="in" name="Maya">The view is unreal</Bubble>
                <Bubble side="out">Can't wait to hear all about it 💙</Bubble>
                <Bubble side="out">Send pics!</Bubble>
                <Bubble side="in" name="Maya">On it 📸</Bubble>
                <div className="flex items-center gap-1 pl-2 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  <span className="ml-2">Maya is typing</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="features" className="mt-28 grid gap-6 md:grid-cols-3">
          <Feature icon={Zap} title="Lightning fast" desc="Messages arrive in real time, with smooth typing indicators and live updates." />
          <Feature icon={Lock} title="Private by design" desc="Row-level security keeps every conversation locked to its members." />
          <Feature icon={Users} title="1:1 & groups" desc="Start a chat with one friend or build a group for your whole crew." />
        </section>
      </main>
    </div>
  );
}

function Bubble({ side, name, children }: { side: "in" | "out"; name?: string; children: React.ReactNode }) {
  const out = side === "out";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-bubble ${
        out ? "rounded-br-md bg-bubble-out text-bubble-out-foreground" : "rounded-bl-md bg-bubble-in text-bubble-in-foreground"
      }`}>
        {!out && name && <div className="mb-0.5 text-xs font-semibold text-primary">{name}</div>}
        {children}
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6 transition hover:shadow-elevated">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
