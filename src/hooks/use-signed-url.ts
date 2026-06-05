import { useQuery } from "@tanstack/react-query";
import { getSignedUrl } from "@/lib/storage";

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-url", bucket, path],
    queryFn: () => getSignedUrl(bucket, path!),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  });
}
