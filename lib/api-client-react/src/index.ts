export * from "./generated/api";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setTenantIdGetter,
  customFetch,
  ApiError,
} from "./custom-fetch";
export type { AuthTokenGetter, CustomFetchOptions } from "./custom-fetch";
export * from "./generated/api.schemas";
