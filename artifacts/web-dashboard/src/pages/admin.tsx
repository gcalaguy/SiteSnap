import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  Users,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Building2,
  TrendingUp,
  Gift,
  Copy,
  Check,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
  status: string;
  current_period_end: number;
  items: { data: Array<{ price: { id: string; product: string } }> };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Active", variant: "default" },
    trialing: { label: "Trial", variant: "secondary" },
    past_due: { label: "Past Due", variant: "destructive" },
    canceled: { label: "Cancelled", variant: "outline" },
    incomplete: { label: "Incomplete", variant: "outline" },
  };
  const info = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  // Check for billing redirect params
  const params = new URLSearchParams(window.location.search);
  const billingResult = params.get("billing");

  // Fetch subscription + company info
  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => customFetch<{ subscription: Subscription | null; company: any }>(`${basePath}/api/billing/subscription`),
  });

  const [copied, setCopied] = useState(false);

  function copyReferralLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Fetch referral info
  const { data: referralData } = useQuery({
    queryKey: ["billing-referrals"],
    queryFn: () => customFetch<{ referralLink?: string; referralCount?: number }>(`${basePath}/api/referrals`),
  });

  // Fetch seat usage
  const { data: seatData, isLoading: seatsLoading } = useQuery({
    queryKey: ["billing-seats"],
    queryFn: () => customFetch<{ currentSeats: number; maxSeats: number | "unlimited"; canAddMore: boolean; planName?: string }>(`${basePath}/api/billing/seats`),
  });

  // Portal mutation
  const portalMutation = useMutation({
    mutationFn: () =>
      customFetch<{ url: string }>(`${basePath}/api/billing/portal`, { method: "POST" }),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
    },
    onError: (err: any) => {
      toast({ title: "Billing portal failed", description: err.message, variant: "destructive" });
    },
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
  const company = subData?.company;
  // Determine current plan metadata
  const activeProductId = subscription?.items?.data?.[0]?.price?.product;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Admin & Billing
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your subscription, team seats, and company settings.
          </p>
        </div>
      </div>

      {/* Billing redirect banners */}
      {billingResult === "success" && (
        <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">Subscription activated! Welcome to Site Snap.</span>
        </div>
      )}
      {billingResult === "cancel" && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">Checkout cancelled. You can subscribe any time below.</span>
        </div>
      )}

      {/* Current Subscription */}
      <div className="rounded-xl p-5" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <CreditCard size={15} style={{ color: GOLD }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Current Subscription</span>
          </div>
        </div>
        <p className="text-xs mb-4" style={{ color: "#71717a" }}>Your company's active billing plan</p>
        {subLoading ? (
          <div className="h-10 rounded-md animate-pulse" style={{ background: "#1f1f1f" }} />
        ) : subscription ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <CreditCard className="h-6 w-6" style={{ color: GOLD }} />
              <div>
                <div className="font-semibold text-sm text-white">
                  Site Snap Plan
                </div>
                <div className="text-xs mt-0.5" style={{ color: GOLD }}>
                  Renews {new Date((subscription.current_period_end ?? 0) * 1000).toLocaleDateString("en-CA", { dateStyle: "medium" })}
                </div>
              </div>
              {statusBadge(subscription.status)}
            </div>
            <Button
              size="sm"
              className="gap-2"
              style={{ background: GOLD, color: BLACK }}
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {portalMutation.isPending ? "Opening…" : "Manage Billing"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3" style={{ color: "#71717a" }}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">No active subscription. Contact your administrator to get started.</span>
          </div>
        )}
      </div>

      {/* Team Seats */}
      <div className="rounded-xl p-5" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Users size={15} style={{ color: GOLD }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Team Seats</span>
        </div>
        <p className="text-xs mb-4" style={{ color: "#71717a" }}>Active team members on your plan</p>
        {seatsLoading ? (
          <div className="h-10 rounded-md animate-pulse" style={{ background: "#1f1f1f" }} />
        ) : seatData ? (
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-white">{seatData.currentSeats}</span>
                <span className="text-sm" style={{ color: "#71717a" }}>
                  / {seatData.maxSeats === "unlimited" ? "∞" : seatData.maxSeats} seats
                </span>
              </div>
              {seatData.maxSeats !== "unlimited" && !seatData.canAddMore && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Limit Reached
                </Badge>
              )}
              {seatData.maxSeats !== "unlimited" && seatData.canAddMore && (
                <span className="text-xs" style={{ color: "#71717a" }}>
                  {(seatData.maxSeats as number) - seatData.currentSeats} seat{(seatData.maxSeats as number) - seatData.currentSeats === 1 ? "" : "s"} remaining
                </span>
              )}
              {seatData.maxSeats === "unlimited" && (
                <span className="text-xs" style={{ color: "#71717a" }}>Unlimited seats</span>
              )}
            </div>
            {seatData.maxSeats !== "unlimited" && (
              <Progress
                value={Math.min(100, (seatData.currentSeats / (seatData.maxSeats as number)) * 100)}
                className={`h-2 ${!seatData.canAddMore ? "[&>div]:bg-destructive" : seatData.currentSeats / (seatData.maxSeats as number) > 0.8 ? "[&>div]:bg-amber-500" : "[&>div]:bg-[#C9A84C]"}`}
              />
            )}
            {!seatData.canAddMore && (
              <p className="text-xs" style={{ color: "#71717a" }}>
                You've reached the seat limit for your{seatData.planName ? ` ${seatData.planName}` : ""} plan. Upgrade to add more team members.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3" style={{ color: "#71717a" }}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">Unable to load seat information.</span>
          </div>
        )}
      </div>

      {/* Refer a Contractor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-primary" />
            Refer a Contractor
          </CardTitle>
          <CardDescription>
            Share your unique link with other construction companies. Help them get set up on Site Snap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {referralData?.referralLink ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground truncate select-all">
                  {referralData.referralLink}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => copyReferralLink(referralData.referralLink ?? "")}
                >
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 text-green-600" />Copied!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" />Copy Link</>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                <span>
                  {referralData.referralCount === 0
                    ? "No contractors referred yet — share your link to get started."
                    : `${referralData.referralCount} contractor${referralData.referralCount === 1 ? "" : "s"} joined using your referral link.`}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">Referral link unavailable. Create your company profile first.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Company Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: "Name", value: company?.name },
            { label: "City", value: company?.city },
            { label: "Province", value: company?.province },
            { label: "Phone", value: company?.phone ?? "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
              <div className="font-medium">{value ?? "—"}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
