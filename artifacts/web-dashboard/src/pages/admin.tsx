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
  Zap,
  Building2,
  Star,
  Crown,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

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
  metadata: {
    plan?: string;
    maxSeats?: string;
    features?: string;
  };
  prices: Price[];
}

interface Subscription {
  id: string;
  status: string;
  current_period_end: number;
  items: { data: Array<{ price: { id: string; product: string } }> };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
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

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-6 w-6 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-6 w-6 text-primary" />;
  if (planSlug === "business") return <Crown className="h-6 w-6 text-yellow-500" />;
  return <Building2 className="h-6 w-6 text-muted-foreground" />;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");

  // Check for billing redirect params
  const params = new URLSearchParams(window.location.search);
  const billingResult = params.get("billing");

  // Fetch subscription + company info
  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const res = await customFetch(`${basePath}/api/billing/subscription`, { method: "GET" });
      return res.json();
    },
  });

  // Fetch plans
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const res = await customFetch(`${basePath}/api/billing/plans`, { method: "GET" });
      return res.json();
    },
  });

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: async ({ priceId }: { priceId: string }) => {
      const res = await customFetch(`${basePath}/api/billing/checkout`, {
        method: "POST",
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      return data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  // Portal mutation
  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await customFetch(`${basePath}/api/billing/portal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Portal failed");
      return data;
    },
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

  // Which price IDs are currently subscribed?
  const activePriceIds = new Set<string>(
    subscription?.items?.data?.map((i: any) => i.price.id) ?? []
  );

  // Determine current plan metadata
  const activeProductId = subscription?.items?.data?.[0]?.price?.product;
  const currentPlan = plans.find((p) => p.id === activeProductId);

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
          <span className="text-sm font-medium">Subscription activated! Welcome to BuildCore.</span>
        </div>
      )}
      {billingResult === "cancel" && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">Checkout cancelled. You can subscribe any time below.</span>
        </div>
      )}

      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Current Subscription
          </CardTitle>
          <CardDescription>Your company's active billing plan</CardDescription>
        </CardHeader>
        <CardContent>
          {subLoading ? (
            <div className="h-16 rounded-md bg-muted animate-pulse" />
          ) : subscription ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                {planIcon(currentPlan?.metadata?.plan)}
                <div>
                  <div className="font-semibold text-sm">
                    {currentPlan?.name ?? "BuildCore Plan"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Renews {new Date((subscription.current_period_end ?? 0) * 1000).toLocaleDateString("en-CA", { dateStyle: "medium" })}
                  </div>
                </div>
                {statusBadge(subscription.status)}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {portalMutation.isPending ? "Opening…" : "Manage Billing"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">No active subscription. Choose a plan below to get started.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Seats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Team Seats
          </CardTitle>
          <CardDescription>Active team members on your account</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-3xl font-bold text-primary">
            {me?.company ? "—" : "—"}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{company?.name ?? "—"}</span>
            <br />
            {currentPlan
              ? `Plan limit: ${currentPlan.metadata.maxSeats === "unlimited" ? "Unlimited" : `${currentPlan.metadata.maxSeats} seats`}`
              : "Subscribe to a plan to add more team members"}
          </div>
        </CardContent>
      </Card>

      {/* Billing Interval Toggle */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Choose a Plan</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${billingInterval === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setBillingInterval("month")}
          >
            Monthly
          </button>
          <button
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${billingInterval === "year" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setBillingInterval("year")}
          >
            Annual
            <span className="ml-1.5 rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px] font-semibold">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      {plansLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = plan.prices.find(
              (p) => p.recurring?.interval === billingInterval
            );
            const isCurrentPlan = plan.id === activeProductId;
            const isPro = plan.metadata.plan === "pro";
            const features = plan.metadata.features?.split(",") ?? [];

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col transition-shadow ${
                  isPro
                    ? "border-primary shadow-md ring-1 ring-primary/30"
                    : "border-border"
                } ${isCurrentPlan ? "bg-primary/[0.03]" : ""}`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground shadow">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    {planIcon(plan.metadata.plan)}
                    <CardTitle className="text-base">{plan.name.replace("BuildCore ", "")}</CardTitle>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold">
                      {price ? formatCAD(price.unitAmount) : "—"}
                    </span>
                    <span className="text-muted-foreground text-sm mb-1">
                      /{billingInterval === "month" ? "mo" : "yr"}
                    </span>
                  </div>
                  <CardDescription className="text-xs mt-1">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col flex-1">
                  <ul className="space-y-2 flex-1">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{f.trim()}</span>
                      </li>
                    ))}
                  </ul>
                  <Separator className="my-4" />
                  {isCurrentPlan && subscription?.status === "active" ? (
                    <Button variant="secondary" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : price ? (
                    <Button
                      className={`w-full ${isPro ? "bg-primary hover:bg-primary/90" : ""}`}
                      variant={isPro ? "default" : "outline"}
                      onClick={() => checkoutMutation.mutate({ priceId: price.id })}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? "Redirecting…" : subscription ? "Switch Plan" : "Get Started"}
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>
                      Unavailable
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
