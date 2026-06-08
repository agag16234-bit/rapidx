
-- 1) Mute column on conversation_members
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

-- 2) conversation_bans
CREATE TABLE IF NOT EXISTS public.conversation_bans (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_bans TO authenticated;
GRANT ALL ON public.conversation_bans TO service_role;
ALTER TABLE public.conversation_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view bans"
  ON public.conversation_bans FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Admins ban"
  ON public.conversation_bans FOR INSERT TO authenticated
  WITH CHECK (private.is_admin_or_owner(conversation_id, auth.uid()) AND auth.uid() = banned_by);

CREATE POLICY "Admins unban"
  ON public.conversation_bans FOR DELETE TO authenticated
  USING (private.is_admin_or_owner(conversation_id, auth.uid()));

-- Block banned users from being (re)added to conversation_members
DROP POLICY IF EXISTS "Add members" ON public.conversation_members;
CREATE POLICY "Add members"
  ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    (
      (auth.uid() = user_id)
      OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
      OR private.is_admin_or_owner(conversation_id, auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_bans b
      WHERE b.conversation_id = conversation_members.conversation_id AND b.user_id = conversation_members.user_id
    )
  );

-- Enforce mute on messages INSERT
DROP POLICY IF EXISTS "Members send messages" ON public.messages;
CREATE POLICY "Members send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND private.is_conversation_member(conversation_id, auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.user_id = auth.uid()
        AND m.muted_until IS NOT NULL
        AND m.muted_until > now()
    )
  );

-- 3) conversation_invites
CREATE TABLE IF NOT EXISTS public.conversation_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'base64'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  max_uses int,
  uses int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_invites_conv ON public.conversation_invites(conversation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_invites TO authenticated;
GRANT ALL ON public.conversation_invites TO service_role;
ALTER TABLE public.conversation_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view invites"
  ON public.conversation_invites FOR SELECT TO authenticated
  USING (private.is_admin_or_owner(conversation_id, auth.uid()));

CREATE POLICY "Admins create invites"
  ON public.conversation_invites FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND private.is_admin_or_owner(conversation_id, auth.uid()));

CREATE POLICY "Admins delete invites"
  ON public.conversation_invites FOR DELETE TO authenticated
  USING (private.is_admin_or_owner(conversation_id, auth.uid()));

-- 4) Redeem a group invite
CREATE OR REPLACE FUNCTION public.join_conversation_by_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _inv public.conversation_invites%ROWTYPE;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _inv FROM public.conversation_invites WHERE token = _token;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invalid invite'; END IF;
  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;
  IF _inv.max_uses IS NOT NULL AND _inv.uses >= _inv.max_uses THEN RAISE EXCEPTION 'Invite used up'; END IF;
  IF EXISTS (SELECT 1 FROM public.conversation_bans b WHERE b.conversation_id = _inv.conversation_id AND b.user_id = _me) THEN
    RAISE EXCEPTION 'You are banned from this group';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (_inv.conversation_id, _me, 'member')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  UPDATE public.conversation_invites SET uses = uses + 1 WHERE id = _inv.id;
  RETURN _inv.conversation_id;
END $$;

-- 5) Channel admin management: allow admins (not just owner) to promote/demote other non-owners
DROP POLICY IF EXISTS "admins manage roles" ON public.channel_members;
CREATE POLICY "owner manages all roles"
  ON public.channel_members FOR UPDATE TO authenticated
  USING (is_channel_owner(channel_id, auth.uid()))
  WITH CHECK (is_channel_owner(channel_id, auth.uid()));

CREATE POLICY "admins manage non-owner roles"
  ON public.channel_members FOR UPDATE TO authenticated
  USING (is_channel_admin(channel_id, auth.uid()) AND role <> 'owner' AND user_id <> auth.uid())
  WITH CHECK (is_channel_admin(channel_id, auth.uid()) AND role <> 'owner');

-- Allow admins (not just owner) to update channel metadata
DROP POLICY IF EXISTS "admins update channels" ON public.channels;
CREATE POLICY "admins update channels"
  ON public.channels FOR UPDATE TO authenticated
  USING (is_channel_admin(id, auth.uid()))
  WITH CHECK (is_channel_admin(id, auth.uid()));
