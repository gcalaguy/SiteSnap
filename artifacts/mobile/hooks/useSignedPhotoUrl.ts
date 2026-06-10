import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

function getSignedUrlPath(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  const normalized = objectPath.replace(/^\//, "");
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

export function useSignedPhotoUrl(objectPath: string | null | undefined) {
  const signedUrlPath = getSignedUrlPath(objectPath);

  const query = useQuery<{ url: string }>({
    queryKey: ["signed-photo-url", objectPath ?? ""],
    queryFn: async () => {
      if (!signedUrlPath) throw new Error("No object path");
      return customFetch<{ url: string }>(signedUrlPath, {
        method: "GET",
      });
    },
    enabled: !!signedUrlPath,
    // M-P7 fix: signed URLs expire after 60 min — cache for 50 min to avoid
    // unnecessary API calls while staying safely within the URL's validity window
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
  });

  return {
    signedUrl: query.data?.url ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
