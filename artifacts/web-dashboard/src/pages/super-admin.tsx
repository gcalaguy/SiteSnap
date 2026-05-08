import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertCircle, CreditCard, ChevronDown, Crown, Gift, Star, Zap } from "lucide-react";

type Price = { id: string; unitAmount: number; recurring: { interval: string } | null };
type StripePlanObj = { id: string; name: string; description: string; metadata: { plan?: string; slug?: string }; prices: Price[] };
type Plan = { id: number; name: string; slug: string; description: string | null; featureIds: number[] };
type Feature = { id: number; name: string };

function formatCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-6 w-6 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-6 w-6 text-primary" />;
  if (planSlug === "business" || planSlug === "enterprise") return <Crown className="h-6 w-6 text-white font-bold" />;
  return <CreditCard className="h-6 w-6 text-muted-foreground" />;
}

function StripePlansTab() {
  const { toast } = useToast();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const { data: plansData, isLoading } = useQuery({ queryKey: ["billing-plans"], queryFn: () => customFetch<{ plans: StripePlanObj[] }>("/api/billing/plans") });
  const { data: dbPlans = [] } = useQuery<Plan[]>({ queryKey: ["admin-plans"], queryFn: () => customFetch<Plan[]>("/api/admin/plans") });
  const { data: dbFeatures = [] } = useQuery<Feature[]>({ queryKey: ["admin-features"], queryFn: () => customFetch<Feature[]>("/api/admin/features") });
  const checkoutMut = useMutation({ mutationFn: ({ priceId }: { priceId: string }) => customFetch<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ priceId }) }), onSuccess: (data) => { window.location.href = data.url; }, onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }) });
  const plans = plansData?.plans ?? [];
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Choose a Plan</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg p-1 bg-black">
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setInterval(v)} className={`rounded-md px-4 py-1.5 text-sm font-medium ${interval === v ? "font-semibold" : "text-zinc-400"}`}>
              {v === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <div className="h-40" /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = plan.prices.find((p) => p.recurring?.interval === interval);
            const planSlug = (plan.metadata.plan ?? plan.metadata.slug ?? "").replace("business", "enterprise");
            const features = dbPlans.find((p) => p.slug === planSlug)?.featureIds.map((id) => dbFeatures.find((f) => f.id === id)?.name).filter(Boolean) ?? [];
            return (
              <Card key={plan.id}>
                <CardHeader>
                  <div className="flex items-center gap-3">{planIcon(planSlug)}<CardTitle>{plan.name}</CardTitle></div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="text-3xl font-bold">{price ? formatCAD(price.unitAmount) : "—"}</div>
                </CardHeader>
                <CardContent>
                  <button onClick={() => setExpandedPlans((prev) => new Set(prev).has(plan.id) ? new Set([...prev].filter((x) => x !== plan.id)) : new Set([...prev, plan.id]))} className="flex w-full items-center justify-between text-sm mb-2">
                    <span>{expandedPlans.has(plan.id) ? "Hide features" : `View ${features.length} features`}</span>
                    <ChevronDown className={`h-4 w-4 ${expandedPlans.has(plan.id) ? "rotate-180" : ""}`} />
                  </button>
                  {expandedPlans.has(plan.id) && <div className="space-y-1">{features.map((f) => <div key={f} className="flex gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-green-500" />{f}</div>)}</div>}
                  <Separator className="my-3" />
                  <Button className="w-full" onClick={() => price && checkoutMut.mutate({ priceId: price.id })} disabled={!price || checkoutMut.isPending}>{checkoutMut.isPending ? "Redirecting…" : "Get Started"}</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <div className="rounded-xl p-5 border border-white/10 bg-black shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Share Sign-up Link</span></div>
            <h3 className="text-lg font-semibold text-white">Invite a new subscriber</h3>
            <p className="text-sm text-zinc-400 max-w-2xl">Send this link by email or copy it to share so they can create a new company.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="border-white/20 text-white font-bold hover:bg-white/5" onClick={() => window.open("/sign-up", "_blank")}>Open Sign Up</Button>
            <Button className="bg-white text-black font-bold hover:bg-zinc-200" onClick={() => window.open("/sign-in", "_blank")}>Sign In</Button>
            <Button variant="outline" className="border-white/20 text-white font-bold hover:bg-white/5" onClick={() => { const link = `${window.location.origin}/sign-up`; const subject = encodeURIComponent("Create your Site Snap company"); const body = encodeURIComponent(`Use this link to create your new company in Site Snap:\n\n${link}`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }}>Email Link</Button>
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/sign-up`)}>Copy Link</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="billing">
        <TabsList>
          <TabsTrigger value="billing">Billing Plans</TabsTrigger>
        </TabsList>
        <TabsContent value="billing">
          <StripePlansTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}