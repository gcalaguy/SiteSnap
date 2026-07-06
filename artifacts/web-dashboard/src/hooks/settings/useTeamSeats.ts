import { useGetBillingSeats } from "@workspace/api-client-react";

export function useTeamSeats() {
  return useGetBillingSeats();
}
