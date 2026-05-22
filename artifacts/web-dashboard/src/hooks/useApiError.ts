import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: unknown;
  message?: string;
}

function extractDetailsMessage(details: unknown): string | undefined {
  if (Array.isArray(details) && details.length > 0) {
    const first = details[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) {
      const msg =
        (first as Record<string, unknown>).message ??
        (first as Record<string, unknown>).msg;
      if (typeof msg === "string") return msg;
    }
  }
  return undefined;
}

/**
 * Parses an API error response into a human-readable message and optional
 * error code.
 */
export function parseApiError(err: unknown): { message: string; code?: string; details?: string } {
  // ApiError from customFetch — has a `.data` property with the full body
  if (
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof (err as Record<string, unknown>).data === "object"
  ) {
    const apiErr = err as { message: string; data: ApiErrorBody | null; status?: number };
    const body = apiErr.data ?? {};
    const topMessage = body.error ?? body.message ?? apiErr.message;
    const detailsMsg = extractDetailsMessage(body.details);
    return {
      message: topMessage,
      code: body.code,
      details: detailsMsg,
    };
  }

  if (err instanceof Error) {
    // Try to parse JSON body if it's a fetch Response-based error
    try {
      const body = JSON.parse(err.message) as ApiErrorBody;
      const detailsMsg = extractDetailsMessage(body.details);
      return {
        message: body.error ?? body.message ?? err.message,
        code: body.code,
        details: detailsMsg,
      };
    } catch {
      return { message: err.message };
    }
  }

  if (typeof err === "object" && err !== null) {
    const body = err as ApiErrorBody;
    const detailsMsg = extractDetailsMessage(body.details);
    return {
      message: body.error ?? body.message ?? "An unexpected error occurred",
      code: body.code,
      details: detailsMsg,
    };
  }

  return { message: String(err) };
}

/**
 * Returns a stable `handleError` function that shows a toast for any API
 * error. Use it in mutation `onError` callbacks.
 *
 * Usage:
 *   const handleError = useApiError();
 *   const mutation = useSomeMutation({ mutation: { onError: handleError } });
 */
export function useApiError() {
  const { toast } = useToast();

  return useCallback(
    (err: unknown, title = "Something went wrong") => {
      const { message, details } = parseApiError(err);
      toast({
        title,
        description: details ? `${message}: ${details}` : message,
        variant: "destructive",
      });
    },
    [toast],
  );
}
