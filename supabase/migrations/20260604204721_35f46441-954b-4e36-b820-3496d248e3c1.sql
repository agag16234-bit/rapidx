
CREATE OR REPLACE FUNCTION public.start_direct_conversation(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid) TO authenticated;
