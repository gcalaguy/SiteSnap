import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { MemberPermissions, UserWithCompany } from "@workspace/api-client-react";
import { useMemberPermissions } from "@/hooks/settings/useMemberPermissions";

const PERMISSION_FIELDS: { key: keyof MemberPermissions; label: string; desc: string }[] = [
  { key: "viewQuotes", label: "View Quotes", desc: "Quotes tab inside projects." },
  { key: "manageQuotes", label: "Manage Quotes", desc: "Create and edit quotes." },
  { key: "viewTimesheets", label: "View Timesheets", desc: "Timesheets and Hours tabs." },
  { key: "viewFinancials", label: "View Financials", desc: "Invoices and cost tracking." },
  { key: "submitExpenses", label: "Submit Expenses", desc: "Add expenses to daily reports." },
  { key: "viewDocuments", label: "View Documents", desc: "Documents and uploads tab." },
  { key: "viewSchedules", label: "View Schedules", desc: "Project schedule tab." },
  { key: "viewClientMessages", label: "View Messages", desc: "Client messages tab." },
  { key: "viewRiskTab", label: "Risk Tab", desc: "Top-level Risk tab (mobile)." },
  { key: "viewSafetyTab", label: "Safety Tab", desc: "Top-level Safety tab (mobile)." },
  { key: "viewInspectTab", label: "Inspect Tab", desc: "Top-level Inspection tab (mobile)." },
  { key: "viewAllProjects", label: "All Projects", desc: "See every project, not just assigned ones (mobile)." },
  { key: "viewDailyLog", label: "Daily Log", desc: "Daily log quick action (mobile)." },
  { key: "viewReports", label: "Reports", desc: "Reports quick action (mobile)." },
  { key: "viewRFIs", label: "RFIs", desc: "RFIs quick action (mobile)." },
  { key: "viewPhotos", label: "Photos", desc: "Photo quick action (mobile)." },
  { key: "viewVault", label: "Vault", desc: "Vault quick action (mobile)." },
  { key: "viewEstimator", label: "Estimator", desc: "Estimator quick action (mobile)." },
  { key: "viewTradeHub", label: "TradeHub", desc: "TradeHub quick action (mobile)." },
  { key: "viewAskAI", label: "Ask AI", desc: "Ask AI quick action (mobile)." },
];

export function PermissionsTab({ companyId, ownerId }: { companyId: number; ownerId: number }) {
  const [collapsed, setCollapsed] = useState(true);
  const {
    selectedUserId, setSelectedUserId,
    editableMembers, permsLoading, resolved,
    toggle, resetToDefaults, isSaving,
  } = useMemberPermissions(companyId, ownerId, !collapsed);

  return (
    <Card>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors text-left border-t-[1px] border-r-[1px] border-b-[1px] border-l-[1px]"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-amber-100">
            <ShieldCheck className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Member Permissions</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Choose which tabs and features each team member can access. Owners and foremen see everything by default.
            </CardDescription>
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {!collapsed && (
        <CardContent className="pt-0 pb-5">
          <Separator className="mb-4" />
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Member list */}
            <div className="sm:w-56 shrink-0 space-y-1">
              {editableMembers.length === 0 && (
                <p className="text-sm text-muted-foreground">No other members to manage.</p>
              )}
              {editableMembers.map((m: UserWithCompany) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedUserId(m.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    selectedUserId === m.id
                      ? "bg-amber-100 text-amber-900"
                      : "hover:bg-accent/50 text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{m.firstName} {m.lastName}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {m.role}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            {/* Permission toggles */}
            <div className="flex-1 space-y-4">
              {!selectedUserId && (
                <p className="text-sm text-muted-foreground">Select a team member to edit their permissions.</p>
              )}
              {selectedUserId && permsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading permissions…
                </div>
              )}
              {selectedUserId && !permsLoading && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {editableMembers.find((m) => m.id === selectedUserId)?.firstName}{" "}
                      {editableMembers.find((m) => m.id === selectedUserId)?.lastName}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={resetToDefaults}
                      disabled={isSaving}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset to Defaults
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERMISSION_FIELDS.map(({ key, label, desc }) => (
                      <label
                        key={key}
                        className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/30 transition-colors cursor-pointer"
                      >
                        <Checkbox
                          checked={!!resolved[key]}
                          onCheckedChange={() => toggle(key)}
                          disabled={isSaving}
                        />
                        <div className="space-y-0.5 leading-none">
                          <span className="text-sm font-medium">{label}</span>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
