import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: unknown;
  message?: string;
}

/**
 * Parses an API error response into a human-readable message and optional
 * error code.
 */
export function parseApiError(err: unknown): { message: string; code?: string } {
  if (err instanceof Error) {
    // Try to parse JSON body if it's a fetch Response-based error
    try {
      const body = JSON.parse(err.message) as ApiErrorBody;
      return {
        message: body.error ?? body.message ?? err.message,
        code: body.code,
      };
    } catch {
      return { message: err.message };
    }
  }

  if (typeof err === "object" && err !== null) {
    const body = err as ApiErrorBody;
    return {
      message: body.error ?? body.message ?? "An unexpected error occurred",
      code: body.code,
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
      const { message } = parseApiError(err);
      toast({
        title,
        description: message,
        variant: "destructive",
      });
    },
    [toast],
  );
}
