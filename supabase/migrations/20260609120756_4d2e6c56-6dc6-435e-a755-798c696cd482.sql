
-- 1. profiles flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- 2. bots table
CREATE TABLE public.bots (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  request_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bots_owner_idx ON public.bots(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their bots" ON public.bots
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 3. bot_tokens
CREATE TABLE public.bot_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX bot_tokens_bot_idx ON public.bot_tokens(bot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_tokens TO authenticated;
GRANT ALL ON public.bot_tokens TO service_role;

ALTER TABLE public.bot_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own tokens" ON public.bot_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_tokens.bot_id AND b.owner_id = auth.uid()));

CREATE POLICY "Owner manages own tokens" ON public.bot_tokens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_tokens.bot_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_tokens.bot_id AND b.owner_id = auth.uid()));

-- 4. bot_activity_logs
CREATE TABLE public.bot_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  status int NOT NULL,
  latency_ms int,
  conversation_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bot_activity_logs_bot_idx ON public.bot_activity_logs(bot_id, created_at DESC);

GRANT SELECT ON public.bot_activity_logs TO authenticated;
GRANT ALL ON public.bot_activity_logs TO service_role;

ALTER TABLE public.bot_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads bot logs" ON public.bot_activity_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_activity_logs.bot_id AND b.owner_id = auth.uid()));

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_bots_updated_at ON public.bots;
CREATE TRIGGER update_bots_updated_at BEFORE UPDATE ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. helper to bump request counts (called via service role)
CREATE OR REPLACE FUNCTION public.increment_bot_request_count(_bot_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bots SET request_count = request_count + 1, last_used_at = now() WHERE id = _bot_id;
$$;

-- 7. realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_activity_logs;
