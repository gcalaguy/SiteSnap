import { Redirect } from "expo-router";

/**
 * Catches any /mobile/* path from the Replit proxy and redirects to home.
 */
export default function MobileDeepRedirect() {
  return <Redirect href="/" />;
}
