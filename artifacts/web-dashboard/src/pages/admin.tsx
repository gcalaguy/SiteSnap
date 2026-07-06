import { useGetMe } from "@workspace/api-client-react";
import { customFetch, type Company } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  ShieldCheck,
  Users,
  CreditCard,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserPlus,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Subscription {
  id: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items?: { data: Array<{ price?: { product?: string; unit_amount?: number; currency?: string; recurring?: { interval: string } } }> };
}

interface SeatInfo {
  currentSeats: number;
  maxSeats: number | "unlimited";
  planName: string | null;
  canAddMore: boolean;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-600 text-white font-semibold">Active</Badge>;
  if (status === "trialing") return <Badge className="bg-blue-500 text-white font-semibold">Trial</Badge>;
  if (status === "past_due") return <Badge className="bg-amber-500 text-white font-semibold">Past Due</Badge>;
  if (status === "canceled") return <Badge className="bg-zinc-600 text-white font-semibold">Canceled</Badge>;
  return <Badge className="bg-zinc-700 text-white font-semibold capitalize">{status}</Badge>;
}

interface SubscriptionCardProps {
  subLoading: boolean;
  subError: boolean;
  subscription: Subscription | null;
  planName: string;
  renewalDate: string | null;
  portalMutation: ReturnType<typeof useMutation<{ url: string }, Error, void>>;
  navigate: (path: string) => void;
}

function SubscriptionCard({ subLoading, subError, subscription, planName, renewalDate, portalMutation, navigate }: SubscriptionCardProps) {
  return (
    <div
      className="rounded-xl border border-white/10 overflow-hidden cursor-pointer group"
      style={{ background: BLACK, boxShadow: "0 4px 20px rgba(0,0,0,0.22)" }}
      onClick={() => { if (subscription) { portalMutation.mutate(); } else { navigate("/super-admin"); } }}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <CreditCard size={15} style={{ color: GOLD }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Current Subscription</span>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-white transition-colors" />
      </div>
      <Separator className="bg-white/10" />
      <div className="px-5 py-4">
        {subLoading && (
          <div className="flex items-center gap-3 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading subscription…</span>
          </div>
        )}
        {!subLoading && subError && (
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">Failed to load subscription info. Please refresh.</span>
          </div>
        )}
        {!subLoading && !subError && subscription && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">{planName}</span>
                  {statusBadge(subscription.status)}
                  {subscription.cancel_at_period_end && (
                    <Badge className="bg-red-700 text-white font-semibold">Cancels at period end</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{subscription.cancel_at_period_end ? `Access until ${renewalDate}` : `Renews ${renewalDate}`}</span>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-2 shrink-0"
                style={{ background: GOLD, color: BLACK }}
                onClick={(e) => { e.stopPropagation(); portalMutation.mutate(); }}
                disabled={portalMutation.isPending}
              >
                {portalMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <ExternalLink className="h-3.5 w-3.5" />}
                {portalMutation.isPending ? "Opening…" : "Manage Billing"}
              </Button>
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-400 pt-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Auto-renewal {subscription.cancel_at_period_end ? "off" : "on"}</span>
              </div>
              <div
                className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); navigate("/super-admin"); }}
              >
                <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
                <span>View &amp; upgrade plans</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        )}
        {!subLoading && !subError && !subscription && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-zinc-400">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <span className="text-sm">No active subscription found for this company.</span>
            </div>
            <Button
              size="sm"
              className="gap-2"
              style={{ background: GOLD, color: BLACK }}
              onClick={(e) => { e.stopPropagation(); navigate("/super-admin"); }}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              View Plans
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();

  const { data: subData, isLoading: subLoading, isError: subError } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => customFetch<{ subscription: Subscription | null; company: Company | null }>(`${basePath}/api/billing/subscription`),
  });

  const { data: seatInfo, isLoading: seatsLoading, isError: seatsError } = useQuery<SeatInfo>({
    queryKey: ["billing-seats"],
    queryFn: () => customFetch<SeatInfo>(`${basePath}/api/billing/seats`),
  });

  const portalMutation = useMutation({
    mutationFn: () => customFetch<{ url: string }>(`${basePath}/api/billing/portal`, { method: "POST" }),
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err: Error) => toast({ title: "Could not open billing portal", description: err.message, variant: "destructive" }),
  });

  if (me?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Owner Access Required</h2>
        <p className="text-muted-foreground text-sm">Only company owners can access the Admin panel.</p>
      </div>
    );
  }

  const subscription: Subscription | null = subData?.subscription ?? null;
  const company = subData?.company ?? null;

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toLocaleDateString("en-CA", { dateStyle: "medium" })
    : null;

  const seatUsed = seatInfo?.currentSeats ?? 0;
  const seatMax = seatInfo?.maxSeats;
  const seatPct = seatMax === "unlimited" || !seatMax
    ? 0
    : Math.round((seatUsed / (seatMax as number)) * 100);
  const planName = seatInfo?.planName ?? company?.name ?? "Site Snap";
  const isSuperAdmin = me?.systemRole === "super_admin";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          {isSuperAdmin ? "Admin & Billing" : "Team Management"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isSuperAdmin
            ? "Manage your subscription, team seats, and company settings."
            : "Manage your team seats and invite new members."}
        </p>
      </div>

      {isSuperAdmin && (
        <SubscriptionCard
          subLoading={subLoading}
          subError={subError}
          subscription={subscription}
          planName={planName}
          renewalDate={renewalDate}
          portalMutation={portalMutation}
          navigate={navigate}
        />
      )}

      {/* ── Team Seats ── */}
      <div
        className="rounded-xl border border-white/10 overflow-hidden cursor-pointer group"
        style={{ background: BLACK, boxShadow: "0 4px 20px rgba(0,0,0,0.22)" }}
        onClick={() => navigate("/team")}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Users size={15} style={{ color: GOLD }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Team Seats</span>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-white transition-colors" />
        </div>
        <Separator className="bg-white/10" />
        <div className="px-5 py-4">
          {seatsLoading ? (
            <div className="flex items-center gap-3 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading seat info…</span>
            </div>
          ) : seatsError ? (
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">Failed to load seat info. Please refresh.</span>
            </div>
          ) : seatInfo ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-white">{seatUsed}</span>
                    <span className="text-zinc-400 text-sm">
                      / {seatMax === "unlimited" ? "∞" : seatMax} seats used
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {seatInfo.canAddMore
                      ? seatMax === "unlimited"
                        ? "Unlimited seats available"
                        : `${(seatMax as number) - seatUsed} seat${(seatMax as number) - seatUsed !== 1 ? "s" : ""} remaining`
                      : "Seat limit reached — upgrade to add more"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-white/20 text-white hover:bg-white/10 shrink-0"
                  onClick={(e) => { e.stopPropagation(); navigate("/team"); }}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Manage Team
                </Button>
              </div>
              {seatMax !== "unlimited" && typeof seatMax === "number" && (
                <div className="space-y-1.5">
                  <Progress
                    value={seatPct}
                    className="h-2 bg-white/10"
                    style={
                      { "--progress-foreground": seatPct >= 90 ? "#ef4444" : seatPct >= 70 ? "#f59e0b" : GOLD } as React.CSSProperties
                    }
                  />
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{seatPct}% of capacity</span>
                    {!seatInfo.canAddMore && isSuperAdmin && (
                      <button
                        className="underline text-amber-400 hover:text-amber-300"
                        onClick={(e) => { e.stopPropagation(); navigate("/super-admin"); }}
                      >
                        Upgrade plan
                      </button>
                    )}
                    {!seatInfo.canAddMore && !isSuperAdmin && (
                      <span className="text-amber-400">Contact support to add seats</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 pt-0.5">
                <span>Click to view and manage all team members</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-zinc-400">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <span className="text-sm">Seat information unavailable.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
