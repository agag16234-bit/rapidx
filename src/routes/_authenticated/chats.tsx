import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Messenger } from "@/components/messenger/Messenger";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({ meta: [{ title: "Chats — Pulse" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: ChatsPage,
});

function ChatsPage() {
  const { user: initialUser } = Route.useRouteContext();
  const [user, setUser] = useState<User>(initialUser);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);
  return <Messenger user={user} />;
}
