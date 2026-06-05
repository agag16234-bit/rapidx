import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSignedUrl } from "@/hooks/use-signed-url";

export function UserAvatar({
  path, name, className, fallbackClassName,
}: { path: string | null | undefined; name: string; className?: string; fallbackClassName?: string }) {
  const { data: url } = useSignedUrl("avatars", path);
  return (
    <Avatar className={className}>
      <AvatarImage src={url ?? undefined} />
      <AvatarFallback className={fallbackClassName ?? "bg-gradient-primary text-white"}>
        {(name || "?").charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function MediaImage({ path, alt }: { path: string; alt?: string }) {
  const { data: url, isLoading } = useSignedUrl("chat-media", path);
  if (isLoading) return <div className="h-48 w-64 animate-pulse rounded-xl bg-muted" />;
  if (!url) return null;
  return <img src={url} alt={alt ?? ""} className="max-h-80 max-w-full rounded-xl object-cover" loading="lazy" />;
}

export function MediaVideo({ path }: { path: string }) {
  const { data: url } = useSignedUrl("chat-media", path);
  if (!url) return <div className="h-48 w-64 animate-pulse rounded-xl bg-muted" />;
  return <video src={url} controls className="max-h-80 max-w-full rounded-xl" />;
}

export function MediaAudio({ path }: { path: string }) {
  const { data: url } = useSignedUrl("chat-media", path);
  if (!url) return null;
  return <audio src={url} controls className="w-64" />;
}

export function MediaFile({ path, name, size }: { path: string; name: string; size?: number | null }) {
  const { data: url } = useSignedUrl("chat-media", path);
  const [downloadName] = useState(name);
  return (
    <a
      href={url ?? "#"}
      download={downloadName}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 rounded-xl bg-background/40 px-3 py-2 hover:bg-background/60"
    >
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">📎</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        {size != null && <div className="text-xs opacity-70">{formatSize(size)}</div>}
      </div>
    </a>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
