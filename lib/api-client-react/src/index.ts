export * from "./generated/api";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setTenantIdGetter,
  customFetch,
} from "./custom-fetch";
export type { AuthTokenGetter, CustomFetchOptions } from "./custom-fetch";
export * from "./generated/api.schemas";
