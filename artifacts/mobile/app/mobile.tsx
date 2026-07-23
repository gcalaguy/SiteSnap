import { Redirect } from "expo-router";

/**
 * Catches the /mobile path prefix from the Replit proxy and redirects to home.
 */
export default function MobileRedirect() {
  return <Redirect href="/" />;
}
