import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle, Users, UserPlus, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Company, UserWithCompany } from "@workspace/api-client-react";
import { useTeamSeats } from "@/hooks/settings/useTeamSeats";

const GOLD = "#C9A84C";

function CollapsibleCard({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
      >
        <CardHeader className={cn("flex flex-row items-center justify-between gap-4 space-y-0", !open && "pb-6")}>
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </CardHeader>
      </button>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}

function TeamSeatsCard() {
  const [, navigate] = useLocation();
  const { data: seatInfo, isLoading: seatsLoading } = useTeamSeats();

  const seatUsed = seatInfo?.currentSeats ?? 0;
  const seatMax = seatInfo?.maxSeats;
  const seatPct = seatMax === "unlimited" || !seatMax ? 0 : Math.round((seatUsed / (seatMax as number)) * 100);

  return (
    <CollapsibleCard
      title={
        <>
          <Users className="h-5 w-5 text-primary" />
          Team Seats
        </>
      }
      description="Manage your company seats and team members."
    >
      <>
        {seatsLoading ? (
          <div className="flex items-center gap-3 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading seat info…</span>
          </div>
        ) : seatInfo ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">{seatUsed}</span>
              <span className="text-muted-foreground text-sm">/ {seatMax === "unlimited" ? "∞" : seatMax} seats used</span>
            </div>
            {seatMax !== "unlimited" && typeof seatMax === "number" && (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${seatPct}%`, background: GOLD }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{seatPct}% of capacity</span>
                  {!seatInfo.canAddMore ? <span className="text-amber-500">Seat limit reached — contact support to add more</span> : null}
                </div>
              </div>
            )}
            <Button className="gap-2 bg-[#D4AF37] text-white hover:bg-[#b5922e] font-semibold" onClick={() => navigate("/team")}>
              <UserPlus className="h-4 w-4" />
              Manage Team
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-zinc-400">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="text-sm">Seat information unavailable.</span>
          </div>
        )}
      </>
    </CollapsibleCard>
  );
}

export function CompanyTab({ user, company }: { user: UserWithCompany | undefined; company: Company | undefined | null }) {
  return (
    <div className="space-y-6">
      {company && (
        <CollapsibleCard
          title="Company Details"
          description="This information is visible on all reports and documents."
        >
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={company.name} readOnly disabled />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={company.city} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Province</Label>
              <Input value={company.province} readOnly disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={company.phone || ""} readOnly disabled />
          </div>
          <p className="text-sm text-muted-foreground pt-4">
            * Company details can only be edited by contacting support currently.
          </p>
        </CollapsibleCard>
      )}

      <CollapsibleCard title="My Profile">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input value={user?.firstName ?? ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Last Name</Label>
            <Input value={user?.lastName ?? ""} readOnly disabled />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={user?.email ?? ""} readOnly disabled />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Input value={user?.role ?? ""} readOnly disabled className="capitalize" />
        </div>
        <p className="text-sm text-muted-foreground pt-4">
          * Profile details are synced from your login provider.
        </p>
      </CollapsibleCard>

      <TeamSeatsCard />
    </div>
  );
}
