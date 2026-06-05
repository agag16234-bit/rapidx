import { supabase } from "@/integrations/supabase/client";

export async function uploadToBucket(bucket: string, file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

const signedUrlCache = new Map<string, { url: string; expires: number }>();

export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
  const key = `${bucket}:${path}`;
  const now = Date.now();
  const cached = signedUrlCache.get(key);
  if (cached && cached.expires > now + 60_000) return cached.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("Failed to sign URL");
  signedUrlCache.set(key, { url: data.signedUrl, expires: now + expiresIn * 1000 });
  return data.signedUrl;
}

export function detectMediaType(file: File): "image" | "video" | "audio" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}
