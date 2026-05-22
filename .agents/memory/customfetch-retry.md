---
name: customFetch retry & timeout
description: retry logic with exponential backoff added to API client customFetch
---
- `customFetch` in `lib/api-client-react` now wraps every request with a 15s timeout and 3-retry exponential backoff (1s/2s/4s). Retries only on 5xx/429/408/network errors; 4xx fails fast. This was a P0 mobile field-crew issue (LTE/3G drops).

**Why:** Zero fault tolerance caused silent failures in field conditions.
**How to apply:** If you modify `customFetch.ts`, preserve `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS`, `isRetryableError`, and the `withTimeout` wrapper.
