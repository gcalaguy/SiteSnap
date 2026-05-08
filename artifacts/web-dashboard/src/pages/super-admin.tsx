import { useState } from "react";
import { api, useGetMe } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Loader2,
  RefreshCw,
  DatabaseZap,
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

interface StripePlanObj {
  id: string;
  name: string;
  description: string;
  metadata: { plan?: string; slug?: string; maxSeats?: string; features?: string };
  prices: Price[];
}

interface Plan {
  id: number; name: string; slug: string;
  description: string | null; monthlyPrice: string; yearlyPrice: string;
  maxSeats: number; isActive: boolean; featureIds: number[];
}

interface Feature {
  id: number; name: string; key: string; description: string | null; isEnabled: boolean;
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

function StripePlansTab() {
  const { toast } = useToast();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => customFetch<{ plans: StripePlanObj[]; publishableKey: string }>(`${basePath}/api/billing/plans`),
  });
  const { data: subData } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => customFetch<{ subscription: any | null }>(`${basePath}/api/billing/subscription`),
  });
  const checkoutMut = useMutation({
    mutationFn: ({ priceId }: { priceId: string }) =>
      customFetch<{ url: string }>(`${basePath}/api/billing/checkout`, {
        method: "POST", body: JSON.stringify({ priceId }),
      }),
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });
  const { data: dbPlans = [] } = useQuery<Plan[]>({
    queryKey: ["admin-plans"],
    queryFn: () => customFetch<Plan[]>("/api/admin/plans"),
  });
  const { data: dbFeatures = [] } = useQuery<Feature[]>({
    queryKey: ["admin-features"],
    queryFn: () => customFetch<Feature[]>("/api/admin/features"),
  });
  const plans: StripePlanObj[] = plansData?.plans ?? [];
  const subscription = subData?.subscription ?? null;
  const activeProductId = subscription?.items?.data?.[0]?.price?.product;
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  function togglePlanFeatures(id: string) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Choose a Plan</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg p-1" style={{ background: BLACK }}>
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setInterval(v)} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${interval === v ? "font-semibold" : "text-zinc-400 hover:text-zinc-200"}`} style={interval === v ? { background: GOLD, color: BLACK } : undefined}>
              {v === "month" ? "Monthly" : <span className="flex items-center gap-1.5">Annual <span className="rounded-full bg-green-700 text-white px-1.5 py-0.5 text-[10px] font-semibold">Save 17%</span></span>}
            </button>
          ))}
        </div>
      </div>
      {plansLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-dashed">
          <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No Stripe plans found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = plan.prices.find((p) => p.recurring?.interval === interval);
            const planSlug = (plan.metadata.plan ?? plan.metadata.slug ?? "").replace("business", "enterprise");
            const dbPlan = dbPlans.find((p) => p.slug === planSlug);
            const features = dbPlan
              ? dbPlan.featureIds.map((id) => dbFeatures.find((f) => f.id === id)).filter((f): f is Feature => !!f).map((f) => f.name)
              : [];
            const isCurrentPlan = plan.id === activeProductId;
            const isPro = planSlug === "pro";
            return (
              <Card key={plan.id} className={`relative flex flex-col transition-shadow ${isPro ? "border-primary shadow-md ring-1 ring-primary/30" : "border-border"} ${isCurrentPlan ? "bg-primary/[0.03]" : ""}`}>
                {isPro && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground shadow">Most Popular</span></div>}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    {planIcon(planSlug)}
                    <CardTitle className="text-base">{planSlug === "business" ? "Enterprise" : plan.name.replace("Site Snap ", "")}</CardTitle>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold">{price ? formatCAD(price.unitAmount) : "—"}</span>
                    <span className="text-muted-foreground text-sm mb-1">/{interval === "month" ? "mo" : "yr"}</span>
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
                    <Button className={`w-full ${isPro ? "bg-primary hover:bg-primary/90" : ""}`} variant={isPro ? "default" : "outline"} onClick={() => checkoutMut.mutate({ priceId: price.id })} disabled={checkoutMut.isPending}>
                      {checkoutMut.isPending ? "Redirecting…" : subscription ? "Switch Plan" : "Get Started"}
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
  );
}
