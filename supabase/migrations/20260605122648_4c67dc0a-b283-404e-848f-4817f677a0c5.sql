
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS bio text DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_last_seen boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));

UPDATE public.profiles
SET username = lower(regexp_replace(coalesce(display_name, 'user'), '[^a-zA-Z0-9_]', '', 'g')) || substr(id::text, 1, 6)
WHERE username IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name text;
  base_handle text;
  final_handle text;
  suffix int := 0;
BEGIN
  base_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  base_handle := lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'username', base_name, 'user'), '[^a-zA-Z0-9_]', '', 'g'));
  IF base_handle = '' OR base_handle IS NULL THEN base_handle := 'user'; END IF;
  final_handle := base_handle;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = final_handle) LOOP
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, display_name, avatar_url, username)
  VALUES (NEW.id, base_name, NEW.raw_user_meta_data->>'avatar_url', final_handle);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_size bigint;

ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';

DROP POLICY IF EXISTS "Members update own read state" ON public.conversation_members;
CREATE POLICY "Members update own read state"
  ON public.conversation_members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON public.message_reactions(message_id);
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view reactions" ON public.message_reactions;
CREATE POLICY "Members view reactions" ON public.message_reactions FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Members add own reactions" ON public.message_reactions;
CREATE POLICY "Members add own reactions" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND private.is_conversation_member(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Users remove own reactions" ON public.message_reactions;
CREATE POLICY "Users remove own reactions" ON public.message_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END $$;
