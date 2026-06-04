DROP POLICY IF EXISTS "Creators add conversation members" ON public.conversation_members;

REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.is_conversation_creator(uuid, uuid);

CREATE POLICY "Creators add conversation members"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE conversations.id = conversation_members.conversation_id
      AND conversations.created_by = auth.uid()
  )
);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;