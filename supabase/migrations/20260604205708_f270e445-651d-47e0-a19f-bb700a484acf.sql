DROP POLICY IF EXISTS "Users add themselves or to convs they're in" ON public.conversation_members;

CREATE POLICY "Users add themselves or to convs they're in"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR private.is_conversation_member(conversation_id, auth.uid())
);