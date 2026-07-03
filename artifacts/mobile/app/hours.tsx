import { Redirect } from "expo-router";

// Hours is now a tab inside the consolidated Workforce hub.
export default function HoursRedirect() {
  return <Redirect href="/workforce?tab=hours" />;
}
