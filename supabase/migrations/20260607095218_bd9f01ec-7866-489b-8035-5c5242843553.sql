
-- ============ CHANNELS ============
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  slug text UNIQUE CHECK (slug ~ '^[a-z0-9_]{3,32}$'),
  description text,
  avatar_url text,
  is_public boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscriber_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_channels_public ON public.channels(is_public, created_at DESC);
CREATE INDEX idx_channels_creator ON public.channels(created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- ============ CHANNEL MEMBERS ============
CREATE TYPE public.channel_role AS ENUM ('owner','admin','subscriber');

CREATE TABLE public.channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.channel_role NOT NULL DEFAULT 'subscriber',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
CREATE INDEX idx_channel_members_user ON public.channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON public.channel_members(channel_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_members TO authenticated;
GRANT ALL ON public.channel_members TO service_role;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

-- Helper functions (SECURITY DEFINER) to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.channel_members WHERE channel_id = _channel_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_channel_admin(_channel_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.channel_members WHERE channel_id = _channel_id AND user_id = _user_id AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.is_channel_owner(_channel_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.channel_members WHERE channel_id = _channel_id AND user_id = _user_id AND role = 'owner');
$$;

CREATE OR REPLACE FUNCTION public.channel_is_public(_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_public FROM public.channels WHERE id = _channel_id;
$$;

-- channels policies
CREATE POLICY "view public or member channels" ON public.channels FOR SELECT TO authenticated
  USING (is_public OR public.is_channel_member(id, auth.uid()));
CREATE POLICY "create channels" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update channel" ON public.channels FOR UPDATE TO authenticated
  USING (public.is_channel_admin(id, auth.uid())) WITH CHECK (public.is_channel_admin(id, auth.uid()));
CREATE POLICY "owner delete channel" ON public.channels FOR DELETE TO authenticated
  USING (public.is_channel_owner(id, auth.uid()));

-- channel_members policies
CREATE POLICY "view members of accessible channels" ON public.channel_members FOR SELECT TO authenticated
  USING (public.channel_is_public(channel_id) OR public.is_channel_member(channel_id, auth.uid()));
CREATE POLICY "self subscribe to public channel" ON public.channel_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.channel_is_public(channel_id));
CREATE POLICY "leave channel" ON public.channel_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_channel_admin(channel_id, auth.uid()));
CREATE POLICY "admins manage roles" ON public.channel_members FOR UPDATE TO authenticated
  USING (public.is_channel_owner(channel_id, auth.uid())) WITH CHECK (public.is_channel_owner(channel_id, auth.uid()));

-- ============ CHANNEL POSTS ============
CREATE TABLE public.channel_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  media_url text,
  media_type text,
  media_name text,
  media_size bigint,
  pinned boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_channel_posts_channel ON public.channel_posts(channel_id, created_at DESC);
CREATE INDEX idx_channel_posts_pinned ON public.channel_posts(channel_id, pinned) WHERE pinned;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_posts TO authenticated;
GRANT ALL ON public.channel_posts TO service_role;
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view posts of accessible channels" ON public.channel_posts FOR SELECT TO authenticated
  USING (public.channel_is_public(channel_id) OR public.is_channel_member(channel_id, auth.uid()));
CREATE POLICY "admins create posts" ON public.channel_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_channel_admin(channel_id, auth.uid()));
CREATE POLICY "admins update posts" ON public.channel_posts FOR UPDATE TO authenticated
  USING (public.is_channel_admin(channel_id, auth.uid())) WITH CHECK (public.is_channel_admin(channel_id, auth.uid()));
CREATE POLICY "admins delete posts" ON public.channel_posts FOR DELETE TO authenticated
  USING (public.is_channel_admin(channel_id, auth.uid()));

-- ============ POST VIEWS ============
CREATE TABLE public.channel_post_views (
  post_id uuid NOT NULL REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT ON public.channel_post_views TO authenticated;
GRANT ALL ON public.channel_post_views TO service_role;
ALTER TABLE public.channel_post_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own views" ON public.channel_post_views FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "record own view" ON public.channel_post_views FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Increment view count trigger
CREATE OR REPLACE FUNCTION public.bump_post_view_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.channel_posts SET view_count = view_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bump_post_view AFTER INSERT ON public.channel_post_views
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_view_count();

-- ============ INVITES ============
CREATE TABLE public.channel_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'base64'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_channel_invites_channel ON public.channel_invites(channel_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_invites TO authenticated;
GRANT ALL ON public.channel_invites TO service_role;
ALTER TABLE public.channel_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view invites" ON public.channel_invites FOR SELECT TO authenticated
  USING (public.is_channel_admin(channel_id, auth.uid()));
CREATE POLICY "admins create invites" ON public.channel_invites FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_channel_admin(channel_id, auth.uid()));
CREATE POLICY "admins delete invites" ON public.channel_invites FOR DELETE TO authenticated
  USING (public.is_channel_admin(channel_id, auth.uid()));

-- ============ SUBSCRIBER COUNT TRIGGERS ============
CREATE OR REPLACE FUNCTION public.bump_channel_subscriber_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels SET subscriber_count = subscriber_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels SET subscriber_count = GREATEST(0, subscriber_count - 1) WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_channel_sub_count_ins AFTER INSERT ON public.channel_members
  FOR EACH ROW EXECUTE FUNCTION public.bump_channel_subscriber_count();
CREATE TRIGGER trg_channel_sub_count_del AFTER DELETE ON public.channel_members
  FOR EACH ROW EXECUTE FUNCTION public.bump_channel_subscriber_count();

-- ============ CREATE CHANNEL RPC ============
CREATE OR REPLACE FUNCTION public.create_channel(
  _name text, _slug text, _description text, _avatar_url text, _is_public boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _id uuid;
  _slug_clean text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _slug_clean := nullif(lower(regexp_replace(coalesce(_slug,''), '[^a-z0-9_]', '', 'g')), '');
  INSERT INTO public.channels (name, slug, description, avatar_url, is_public, created_by, subscriber_count)
  VALUES (trim(_name), _slug_clean, nullif(_description,''), nullif(_avatar_url,''), coalesce(_is_public, true), _me, 0)
  RETURNING id INTO _id;
  INSERT INTO public.channel_members (channel_id, user_id, role) VALUES (_id, _me, 'owner');
  RETURN _id;
END $$;

-- ============ JOIN BY INVITE RPC ============
CREATE OR REPLACE FUNCTION public.join_channel_by_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _inv public.channel_invites%ROWTYPE;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _inv FROM public.channel_invites WHERE token = _token;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invalid invite'; END IF;
  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN RAISE EXCEPTION 'Invite expired'; END IF;
  IF _inv.max_uses IS NOT NULL AND _inv.uses >= _inv.max_uses THEN RAISE EXCEPTION 'Invite used up'; END IF;
  INSERT INTO public.channel_members (channel_id, user_id, role) VALUES (_inv.channel_id, _me, 'subscriber')
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  UPDATE public.channel_invites SET uses = uses + 1 WHERE id = _inv.id;
  RETURN _inv.channel_id;
END $$;

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_posts;
