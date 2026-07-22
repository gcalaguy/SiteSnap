import type { StatusTone } from "@/components/ui/StatusPill";

// Mirrors the web Company Expenses page: only "processed" gets its own
// treatment, every other status (submitted, pending, etc.) reads as pending review.
export function getExpenseStatusTone(status: string): StatusTone {
  return status === "processed" ? "approved" : "pending";
}

export function getExpenseStatusLabel(status: string): string {
  return status === "processed" ? "Processed" : "Pending Review";
}
