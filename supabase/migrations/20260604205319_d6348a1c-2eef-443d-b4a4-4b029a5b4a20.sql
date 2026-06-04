ALTER TABLE public.conversations
  ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE id = _conv_id
      AND created_by = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_creator(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'Creators view new conversations'
  ) THEN
    CREATE POLICY "Creators view new conversations"
    ON public.conversations
    FOR SELECT
    TO authenticated
    USING (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversation_members'
      AND policyname = 'Creators add conversation members'
  ) THEN
    CREATE POLICY "Creators add conversation members"
    ON public.conversation_members
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_conversation_creator(conversation_id, auth.uid()));
  END IF;
END $$;