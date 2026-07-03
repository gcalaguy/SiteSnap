import { Redirect } from "expo-router";

// Timesheet Overview is now the Hours tab inside the consolidated Workforce hub.
export default function TimesheetsRedirect() {
  return <Redirect href="/workforce?tab=hours" />;
}
