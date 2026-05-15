import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSetActiveCompany, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CheckCircle2, Building2 } from "lucide-react";
import type { UserWithCompany } from "@workspace/api-client-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#141414";
const GOLD_BORDER = "#2A2200";

interface Props {
  user: UserWithCompany | undefined;
}

export function CompanySwitcher({ user }: Props) {
  const qc = useQueryClient();
  const setActive = useSetActiveCompany();
  const [open, setOpen] = useState(false);

  const memberships = user?.memberships ?? [];
  const activeCompanyId = user?.activeCompanyId ?? user?.companyId ?? null;

  const activeMembership = memberships.find((m) => m.companyId === activeCompanyId);
  const companyName = activeMembership?.companyName ?? user?.company?.name ?? "No Company";
  const companyInitials = companyName.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
  const currentRole = activeMembership?.role ?? user?.role ?? "Member";

  const handleSwitch = (companyId: number) => {
    if (companyId === activeCompanyId) {
      setOpen(false);
      return;
    }
    setActive.mutate(
      { data: { companyId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          window.location.reload();
        },
      },
    );
  };

  // If user has only one (or zero) memberships, show static badge without dropdown
  if (memberships.length <= 1) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{ background: SURFACE, border: `1px solid ${GOLD_BORDER}` }}
      >
        <div
          className="rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            background: `${GOLD}22`,
            color: GOLD,
            border: `1px solid ${GOLD}44`,
          }}
        >
          {companyInitials || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>{companyName}</p>
          <p className="text-xs capitalize" style={{ color: "#666" }}>{currentRole}</p>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer"
          style={{ background: SURFACE, border: `1px solid ${GOLD_BORDER}` }}
        >
          <div
            className="rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              width: 28,
              height: 28,
              background: `${GOLD}22`,
              color: GOLD,
              border: `1px solid ${GOLD}44`,
            }}
          >
            {companyInitials || "?"}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-semibold truncate" style={{ color: "#FFF" }}>{companyName}</p>
            <p className="text-xs capitalize" style={{ color: "#666" }}>{currentRole}</p>
          </div>
          <ChevronDown size={13} style={{ color: "#555" }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        style={{ background: BLACK, border: `1px solid ${GOLD_BORDER}` }}
      >
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#666" }}>
          Your Companies
        </div>
        {memberships.map((m) => {
          const isActive = m.companyId === activeCompanyId;
          const initials = (m.companyName ?? "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <DropdownMenuItem
              key={m.companyId}
              onClick={() => handleSwitch(m.companyId)}
              className="flex items-center gap-2 cursor-pointer px-3 py-2"
              style={{ color: "#FFF" }}
            >
              <div
                className="rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  background: isActive ? `${GOLD}22` : "#222",
                  color: isActive ? GOLD : "#888",
                  border: `1px solid ${isActive ? `${GOLD}44` : "#333"}`,
                }}
              >
                {initials || <Building2 size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.companyName ?? `Company ${m.companyId}`}</p>
                <p className="text-xs capitalize" style={{ color: "#666" }}>{m.role}</p>
              </div>
              {isActive && <CheckCircle2 size={14} style={{ color: GOLD }} />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
