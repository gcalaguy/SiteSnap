import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

/** Convert a storage object path into a signed-url endpoint path. */
export function getSignedUrlPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/^\//, "");
  if (normalized.startsWith("objects/")) {
    const rest = normalized.replace(/^objects\//, "");
    return `/api/storage/objects/${rest}/signed-url`;
  }
  if (normalized.startsWith("api/storage/objects/")) {
    const rest = normalized.replace(/^api\/storage\/objects\//, "");
    return `/api/storage/objects/${rest}/signed-url`;
  }
  return null;
}

/** Fetch a signed GCS URL for a private storage object. Caches for 10 min. */
export function useSignedUrl(objectPath: string | null | undefined) {
  const signedPath = getSignedUrlPath(objectPath);
  return useQuery({
    queryKey: ["signed-url", objectPath],
    queryFn: async () => {
      if (!signedPath) return null;
      const { url } = (await customFetch(signedPath)) as { url: string };
      return url;
    },
    enabled: !!signedPath,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Download a file via its signed URL. Opens in a new tab. */
export function useSignedDownload(objectPath: string | null | undefined) {
  const [isFetching, setIsFetching] = useState(false);
  const { data: signedUrl } = useSignedUrl(objectPath);

  async function open() {
    if (signedUrl) {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const path = getSignedUrlPath(objectPath);
    if (!path) return;
    setIsFetching(true);
    try {
      const { url } = (await customFetch(path)) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // silently fail – caller can show toast
    } finally {
      setIsFetching(false);
    }
  }

  return { open, isFetching, signedUrl };
}
