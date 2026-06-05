
-- Avatars
DROP POLICY IF EXISTS "Avatars are viewable by authenticated" ON storage.objects;
CREATE POLICY "Avatars are viewable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Chat media
DROP POLICY IF EXISTS "Chat media viewable by authenticated" ON storage.objects;
CREATE POLICY "Chat media viewable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "Users upload own chat media" ON storage.objects;
CREATE POLICY "Users upload own chat media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own chat media" ON storage.objects;
CREATE POLICY "Users delete own chat media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);
