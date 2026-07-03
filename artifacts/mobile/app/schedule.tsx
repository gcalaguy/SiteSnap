import { Redirect } from "expo-router";

// Schedule is now a tab inside the consolidated Workforce hub.
export default function ScheduleRedirect() {
  return <Redirect href="/workforce?tab=schedule" />;
}
