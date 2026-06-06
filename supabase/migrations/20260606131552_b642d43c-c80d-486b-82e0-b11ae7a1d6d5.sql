
-- Move trigger fn to private schema; only the trigger itself executes it
DROP TRIGGER IF EXISTS on_conversation_created ON public.conversations;
DROP FUNCTION IF EXISTS public.add_creator_as_owner();

CREATE OR REPLACE FUNCTION private.add_creator_as_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'owner';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_conversation_created
AFTER INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION private.add_creator_as_owner();
