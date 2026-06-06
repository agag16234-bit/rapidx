
-- 1. Add role to conversation_members
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner','admin','member'));

-- 2. Group metadata on conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS description text;

-- 3. Helper: get role of a user in a conversation (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION private.member_role(_conv_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.conversation_members
  WHERE conversation_id = _conv_id AND user_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_admin_or_owner(_conv_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conv_id AND user_id = _user_id AND role IN ('owner','admin')
  );
$$;

-- 4. Refresh policies on conversation_members
DROP POLICY IF EXISTS "Users add themselves or to convs they're in" ON public.conversation_members;
DROP POLICY IF EXISTS "Creators add conversation members" ON public.conversation_members;
DROP POLICY IF EXISTS "Users remove themselves" ON public.conversation_members;
DROP POLICY IF EXISTS "Admins remove members" ON public.conversation_members;
DROP POLICY IF EXISTS "Admins update member roles" ON public.conversation_members;
DROP POLICY IF EXISTS "Members update own read state" ON public.conversation_members;

-- Self-add (e.g. for direct convs) OR creator-add OR admin/owner-add
CREATE POLICY "Add members" ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid()
  )
  OR private.is_admin_or_owner(conversation_id, auth.uid())
);

-- Members can update their own last_read_at; admins/owners can change others' roles (but not promote to/from owner unless owner)
CREATE POLICY "Update own membership" ON public.conversation_members
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update other memberships" ON public.conversation_members
FOR UPDATE TO authenticated
USING (private.is_admin_or_owner(conversation_id, auth.uid()) AND user_id <> auth.uid())
WITH CHECK (private.is_admin_or_owner(conversation_id, auth.uid()) AND user_id <> auth.uid());

-- Self-leave OR admin/owner removing a non-owner
CREATE POLICY "Remove members" ON public.conversation_members
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR (
    private.is_admin_or_owner(conversation_id, auth.uid())
    AND role <> 'owner'
  )
);

-- 5. Conversations: only admins/owners can update group metadata
DROP POLICY IF EXISTS "Members update conversations" ON public.conversations;
CREATE POLICY "Admins update conversations" ON public.conversations
FOR UPDATE TO authenticated
USING (private.is_admin_or_owner(id, auth.uid()))
WITH CHECK (private.is_admin_or_owner(id, auth.uid()));

-- Allow group owners/admins to delete (cascade members/messages)
DROP POLICY IF EXISTS "Owners delete conversations" ON public.conversations;
CREATE POLICY "Owners delete conversations" ON public.conversations
FOR DELETE TO authenticated
USING (private.member_role(id, auth.uid()) = 'owner');

-- 6. Trigger: when a conversation is created, make creator owner automatically (idempotent)
CREATE OR REPLACE FUNCTION public.add_creator_as_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_conversation_created ON public.conversations;
CREATE TRIGGER on_conversation_created
AFTER INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_owner();

-- Ensure conversation_members has a unique (conversation_id, user_id) constraint for ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_members_pkey' OR conname = 'conversation_members_conv_user_unique'
  ) THEN
    ALTER TABLE public.conversation_members
      ADD CONSTRAINT conversation_members_conv_user_unique UNIQUE (conversation_id, user_id);
  END IF;
END $$;

-- 7. RPC: create_group(name, description, avatar_url, member_ids[])
CREATE OR REPLACE FUNCTION public.create_group(
  _name text,
  _description text,
  _avatar_url text,
  _member_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _conv_id uuid;
  _uid uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN RAISE EXCEPTION 'Group name required'; END IF;

  INSERT INTO public.conversations (is_group, name, description, avatar_url, created_by)
  VALUES (true, trim(_name), nullif(_description,''), nullif(_avatar_url,''), _me)
  RETURNING id INTO _conv_id;

  -- creator is added by trigger; insert other members
  IF _member_ids IS NOT NULL THEN
    FOREACH _uid IN ARRAY _member_ids LOOP
      IF _uid <> _me THEN
        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES (_conv_id, _uid, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN _conv_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_group(text,text,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group(text,text,text,uuid[]) TO authenticated, service_role;
