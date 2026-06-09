REVOKE EXECUTE ON FUNCTION public.increment_bot_request_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_bot_request_count(uuid) TO service_role;