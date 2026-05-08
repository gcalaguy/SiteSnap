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
  Zap,
  Star,
  Crown,
  ChevronDown,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  metadata: { plan?: string; maxSeats?: string; features?: string; slug?: string };
  prices: Price[];
}

interface DbPlan {
  id: number; name: string; slug: string;
  featureIds: number[];
}

interface DbFeature {
  id: number; name: string; key: string; isEnabled: boolean;
}

interface Subscription {
  id: string;
  status: string;
  current_period_end: number;
  items: { data: Array<{ price: { id: string; product: string } }> };
}

function formatCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-6 w-6 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-6 w-6 text-primary" />;
  if (planSlug === "business" || planSlug === "enterprise") return <Crown className="h-6 w-6 text-yellow-500" />;
  return <CreditCard className="h-6 w-6 text-muted-foreground" />;
}

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

export default function AdminPage() {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const params = new URLSearchParams(window.location.search);
  const billingResult = params.get("billing");

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => customFetch<{ plans: Plan[]; publishableKey: string }>(`${basePath}/api/billing/plans`),
  });

  const { data: dbPlans = [] } = useQuery<DbPlan[]>({
    queryKey: ["admin-plans"],
    queryFn: () => customFetch<DbPlan[]>(`${basePath}/api/admin/plans`),
  });
  const { data: dbFeatures = [] } = useQuery<DbFeature[]>({
    queryKey: ["admin-features"],
    queryFn: () => customFetch<DbFeature[]>(`${basePath}/api/admin/features`),
  });
  const referralLink = `${window.location.origin}/register`;

  const checkoutMutation = useMutation({
    mutationFn: ({ priceId }: { priceId: string }) =>
      customFetch<{ url: string }>(`${basePath}/api/billing/checkout`, {
        method: "POST",
        body: JSON.stringify({ priceId }),
      }),
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err: any) => { toast({ title: "Checkout failed", description: err.message, variant: "destructive" }); },
  });

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => customFetch<{ subscription: Subscription | null; company: any }>(`${basePath}/api/billing/subscription`),
  });

  const [copied, setCopied] = useState(false);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  function togglePlanFeatures(id: string) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function copyReferralLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const { data: referralData } = useQuery({
    queryKey: ["billing-referrals"],
    queryFn: () => customFetch<{ referralLink?: string; referralCount?: number }>(`${basePath}/api/referrals`),
  });

  const { data: seatData, isLoading: seatsLoading } = useQuery({
    queryKey: ["billing-seats"],
    queryFn: () => customFetch<{ currentSeats: number; maxSeats: number | "unlimited"; canAddMore: boolean; planName?: string }>(`${basePath}/api/billing/seats`),
  });

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
  const plans: Plan[] = plansData?.plans ?? [];
  const activeProductId = subscription?.items?.data?.[0]?.price?.product;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Admin & Billing
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your subscription, team seats, and company settings.</p>
        </div>
      </div>

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
                <div className="font-semibold text-sm text-white">Site Snap Plan</div>
                <div className="text-xs mt-0.5" style={{ color: GOLD }}>
                  Renews {new Date((subscription.current_period_end ?? 0) * 1000).toLocaleDateString("en-CA", { dateStyle: "medium" })}
                </div>
              </div>
              {statusBadge(subscription.status)}
            </div>
            <Button size="sm" className="gap-2" style={{ background: GOLD, color: BLACK }} onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
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

      <div className="rounded-xl p-5 border border-white/10 bg-black shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4" style={{ color: GOLD }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Refer Another Company</span>
            </div>
            <h3 className="text-lg font-semibold text-white">Invite a company to register</h3>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Share this link so another company can register a plan and sign in to get started.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-white/20 text-white font-bold hover:bg-white/5"
              onClick={() => window.open("/sign-up", "_blank")}
            >
              Register a Plan
            </Button>
            <Button
              className="bg-white text-black font-bold hover:bg-zinc-200"
              onClick={() => window.open("/sign-in", "_blank")}
            >
              Sign In
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 break-all">
          {referralLink}
        </div>
      </div>

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
                <span className="text-sm" style={{ color: "#71717a" }}>/ {seatData.maxSeats === "unlimited" ? "∞" : seatData.maxSeats} seats</span>
              </div>
              {seatData.maxSeats !== "unlimited" && !seatData.canAddMore && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Limit Reached
                </Badge>
              )}
            </div>
            {seatData.maxSeats !== "unlimited" && (
              <Progress value={Math.min(100, (seatData.currentSeats / (seatData.maxSeats as number)) * 100)} className="h-2" />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3" style={{ color: "#71717a" }}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">Unable to load seat information.</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Choose a Plan</h2>
          <div className="ml-auto flex items-center gap-1 rounded-lg p-1" style={{ background: BLACK }}>
            {(["month", "year"] as const).map((v) => (
              <button key={v} onClick={() => setBillingInterval(v)} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${billingInterval === v ? "font-semibold" : "text-zinc-400 hover:text-zinc-200"}`} style={billingInterval === v ? { background: GOLD, color: BLACK } : undefined}>
                {v === "month" ? "Monthly" : <span className="flex items-center gap-1.5">Annual <span className="rounded-full bg-green-700 text-white px-1.5 py-0.5 text-[10px] font-semibold">Save 17%</span></span>}
              </button>
            ))}
          </div>
        </div>

        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const price = plan.prices.find((p) => p.recurring?.interval === billingInterval);
              const isCurrentPlan = plan.id === activeProductId;
              const metaPlan = plan.metadata.plan ?? plan.metadata.slug ?? "";
              const planSlug = metaPlan === "business" ? "enterprise" : metaPlan;
              const dbPlan = dbPlans.find((p) => p.slug === planSlug);
              const features = dbPlan
                ? dbPlan.featureIds
                    .map((id) => dbFeatures.find((f) => f.id === id))
                    .filter((f): f is DbFeature => !!f)
                    .map((f) => f.name)
                : [];
              const isPro = planSlug === "pro";
              return (
                <Card key={plan.id} className={`relative flex flex-col transition-shadow ${isPro ? "border-primary shadow-md ring-1 ring-primary/30" : "border-border"} ${isCurrentPlan ? "bg-primary/[0.03]" : ""}`}>
                  {isPro && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground shadow">Most Popular</span>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3 mb-2">
                      {planIcon(planSlug)}
                      <CardTitle className="text-base">{planSlug === "business" ? "Enterprise" : plan.name.replace("Site Snap ", "")}</CardTitle>
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold">{price ? formatCAD(price.unitAmount) : "—"}</span>
                      <span className="text-muted-foreground text-sm mb-1">/{billingInterval === "month" ? "mo" : "yr"}</span>
                    </div>
                    <CardDescription className="text-xs mt-1">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-1">
                    <button onClick={() => togglePlanFeatures(plan.id)} className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
                      <span>{expandedPlans.has(plan.id) ? "Hide features" : `View ${features.length} features`}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedPlans.has(plan.id) ? "rotate-180" : ""}`} />
                    </button>
                    {expandedPlans.has(plan.id) && (
                      <ul className="space-y-1.5 mb-3 border-t pt-3">
                        {features.length > 0 ? features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            <span>{f.trim()}</span>
                          </li>
                        )) : <li className="text-sm text-muted-foreground">No features attached.</li>}
                      </ul>
                    )}
                    <Separator className="my-3" />
                    {isCurrentPlan && subscription?.status === "active" ? (
                      <Button variant="secondary" className="w-full" disabled>Current Plan</Button>
                    ) : price ? (
                      <Button className={`w-full ${isPro ? "bg-primary hover:bg-primary/90" : ""}`} variant={isPro ? "default" : "outline"} onClick={() => checkoutMutation.mutate({ priceId: price.id })} disabled={checkoutMutation.isPending}>
                        {checkoutMutation.isPending ? "Redirecting…" : subscription ? "Switch Plan" : "Get Started"}
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>Unavailable</Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
