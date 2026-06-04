CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_conversation_member(_conv_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members
    WHERE conversation_id = _conv_id
      AND user_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_conversation_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members view memberships" ON public.conversation_members;
DROP POLICY IF EXISTS "Members view messages" ON public.messages;
DROP POLICY IF EXISTS "Members send messages" ON public.messages;

CREATE POLICY "Members view conversations" ON public.conversations FOR SELECT TO authenticated
  USING (private.is_conversation_member(id, auth.uid()));
CREATE POLICY "Members update conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (private.is_conversation_member(id, auth.uid()));
CREATE POLICY "Members view memberships" ON public.conversation_members FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Members view messages" ON public.messages FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND private.is_conversation_member(conversation_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.start_direct_conversation(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv_id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _other_user IS NULL OR _other_user = _me THEN RAISE EXCEPTION 'Invalid user'; END IF;

  SELECT c.id INTO _conv_id
  FROM public.conversations c
  JOIN public.conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = _me
  JOIN public.conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = _other_user
  WHERE c.is_group = false
  LIMIT 1;

  IF _conv_id IS NOT NULL THEN RETURN _conv_id; END IF;

  INSERT INTO public.conversations (is_group, created_by) VALUES (false, _me)
  RETURNING id INTO _conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES
    (_conv_id, _me),
    (_conv_id, _other_user);

  RETURN _conv_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon, authenticated;