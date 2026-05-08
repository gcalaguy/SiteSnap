import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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

interface TenantRow {
  id: number;
  name: string;
  subscription: { id: number; planId: number; status: string; billingCycle: string } | null;
  plan: { id: number; name: string; slug: string } | null;
  userCount: number;
}

interface TenantDetail extends TenantRow {
  users: Array<{ id: number; email: string; firstName: string; lastName: string; role: string; systemRole: string | null }>;
}

function formatCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-6 w-6 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-6 w-6 text-primary" />;
  if (planSlug === "business" || planSlug === "enterprise") return <Crown className="h-6 w-6 text-white font-bold" />;
  return <CreditCard className="h-6 w-6 text-muted-foreground" />;
}

function adminPlanSlug(slug: string) {
  return slug === "business" ? "enterprise" : slug;
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

function ManageTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [planOpen, setPlanOpen] = useState(false);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [tenantDetailId, setTenantDetailId] = useState<number | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editingFeatureId, setEditingFeatureId] = useState<number | null>(null);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [planFeatureIds, setPlanFeatureIds] = useState<number[]>([]);
  const [planForm, setPlanForm] = useState({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5 });
  const [featureForm, setFeatureForm] = useState({ name: "", key: "", description: "" });
  const [tenantForm, setTenantForm] = useState({ planId: "", status: "active", billingCycle: "monthly" });

  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["admin-plans"], queryFn: () => customFetch<Plan[]>("/api/admin/plans") });
  const { data: features = [] } = useQuery<Feature[]>({ queryKey: ["admin-features"], queryFn: () => customFetch<Feature[]>("/api/admin/features") });
  const { data: tenants = [] } = useQuery<TenantRow[]>({ queryKey: ["admin-tenants"], queryFn: () => customFetch<TenantRow[]>("/api/admin/tenants") });
  const { data: tenantDetail } = useQuery<TenantDetail>({
    queryKey: ["admin-tenant-detail", tenantDetailId],
    queryFn: () => customFetch<TenantDetail>(`/api/admin/tenants/${tenantDetailId}`),
    enabled: tenantDetailId !== null,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
    qc.invalidateQueries({ queryKey: ["admin-features"] });
    qc.invalidateQueries({ queryKey: ["admin-tenants"] });
  };

  const savePlan = useMutation({
    mutationFn: async () => {
      const payload = {
        ...planForm,
        maxSeats: Number(planForm.maxSeats),
        description: planForm.description || null,
      };
      return editingPlanId
        ? customFetch(`/api/admin/plans/${editingPlanId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : customFetch("/api/admin/plans", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (res: any) => {
      if (res?.id && planFeatureIds.length > 0) {
        await customFetch(`/api/admin/plans/${res.id}/features`, { method: "PUT", body: JSON.stringify({ featureIds: planFeatureIds }) });
      }
      setPlanOpen(false);
      setEditingPlanId(null);
      setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5 });
      setPlanFeatureIds([]);
      refresh();
      toast({ title: "Plan saved" });
    },
    onError: (e: any) => toast({ title: "Plan save failed", description: e.message, variant: "destructive" }),
  });

  const saveFeature = useMutation({
    mutationFn: () => {
      const payload = { ...featureForm, description: featureForm.description || null };
      return editingFeatureId
        ? customFetch(`/api/admin/features/${editingFeatureId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : customFetch("/api/admin/features", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      setFeatureOpen(false);
      setEditingFeatureId(null);
      setFeatureForm({ name: "", key: "", description: "" });
      refresh();
      toast({ title: "Feature saved" });
    },
    onError: (e: any) => toast({ title: "Feature save failed", description: e.message, variant: "destructive" }),
  });

  const saveTenant = useMutation({
    mutationFn: () => customFetch(`/api/admin/tenants/${editingTenantId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify({
        planId: tenantForm.planId ? Number(tenantForm.planId) : undefined,
        status: tenantForm.status,
        billingCycle: tenantForm.billingCycle,
      }),
    }),
    onSuccess: () => {
      setTenantOpen(false);
      setEditingTenantId(null);
      refresh();
      toast({ title: "Tenant subscription updated" });
    },
    onError: (e: any) => toast({ title: "Tenant update failed", description: e.message, variant: "destructive" }),
  });

  const deleteTenant = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/tenants/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setTenantDetailId(null);
      refresh();
      toast({ title: "Tenant deleted" });
    },
    onError: (e: any) => toast({ title: "Tenant delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList className="bg-black text-white border border-white/20">
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-end"><Button className="bg-white text-black font-bold hover:bg-zinc-200" onClick={() => { setEditingPlanId(null); setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5 }); setPlanFeatureIds([]); setPlanOpen(true); }}>Create Plan</Button></div>
          <div className="grid gap-4">
            {plans.map((p) => (
              <Card key={p.id} className="border-white/15 bg-black/70"><CardContent className="flex items-center justify-between py-4"><div><div className="font-semibold text-white">{p.name}</div><div className="text-sm text-zinc-400">{p.slug} · {p.monthlyPrice}/{p.yearlyPrice}</div></div><Button variant="outline" className="border-white/20 text-white font-bold" onClick={() => { setEditingPlanId(p.id); setPlanForm({ name: p.name, slug: p.slug, description: p.description ?? "", monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, maxSeats: p.maxSeats }); setPlanFeatureIds(p.featureIds); setPlanOpen(true); }}>Edit</Button></CardContent></Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="features" className="space-y-4">
          <div className="flex justify-end"><Button className="bg-white text-black font-bold hover:bg-zinc-200" onClick={() => { setEditingFeatureId(null); setFeatureForm({ name: "", key: "", description: "" }); setFeatureOpen(true); }}>Create Feature</Button></div>
          <div className="grid gap-4">
            {features.map((f) => (
              <Card key={f.id} className="border-white/15 bg-black/70"><CardContent className="flex items-center justify-between py-4"><div><div className="font-semibold text-white">{f.name}</div><div className="text-sm text-green-500">{f.key}</div></div><Button variant="outline" className="border-white/20 text-white font-bold" onClick={() => { setEditingFeatureId(f.id); setFeatureForm({ name: f.name, key: f.key, description: f.description ?? "" }); setFeatureOpen(true); }}>Edit</Button></CardContent></Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="tenants" className="space-y-4">
          <div className="grid gap-4">
            {tenants.map((t) => (
              <Card key={t.id} className="border-white/15 bg-black/70"><CardContent className="flex items-center justify-between py-4"><div><div className="font-semibold text-white">{t.name}</div><div className="text-sm text-zinc-400">{t.plan?.name ?? "No plan"} · {t.userCount} users</div></div><div className="flex gap-2"><Button variant="outline" className="border-white/20 text-white font-bold" onClick={() => setTenantDetailId(t.id)}>View</Button><Button variant="outline" className="border-white/20 text-white font-bold" onClick={() => { setEditingTenantId(t.id); setTenantForm({ planId: t.subscription?.planId ? String(t.subscription.planId) : "", status: t.subscription?.status ?? "active", billingCycle: t.subscription?.billingCycle ?? "monthly" }); setTenantOpen(true); }}>Edit</Button></div></CardContent></Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={tenantDetailId !== null} onOpenChange={(open) => !open && setTenantDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tenantDetail?.name ?? "Tenant"}</DialogTitle>
            <DialogDescription>{tenantDetail?.plan?.name ?? tenants.find((t) => t.id === tenantDetailId)?.plan?.name ?? "No plan"} · {tenantDetail?.users.length ?? 0} users</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(tenantDetail?.users ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-md border border-white/10 bg-black/60 px-3 py-2">
                <div>
                  <div className="font-medium text-white">{u.firstName} {u.lastName}</div>
                  <div className="text-sm text-zinc-400">{u.email}</div>
                </div>
                <Badge className={u.systemRole ? "bg-green-600 text-white" : "bg-zinc-800 text-zinc-200"}>{u.systemRole ?? u.role}</Badge>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="destructive" onClick={() => tenantDetailId && deleteTenant.mutate(tenantDetailId)}>Delete Tenant</Button>
            <Button variant="outline" className="border-white/20 text-white font-bold" onClick={() => setTenantDetailId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPlanId ? "Edit Plan" : "Create Plan"}</DialogTitle><DialogDescription>Manage DB plans and attach features.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Input placeholder="Name" value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Slug" value={planForm.slug} onChange={(e) => setPlanForm((p) => ({ ...p, slug: e.target.value }))} />
            <Input placeholder="Description" value={planForm.description} onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))} />
            <Input placeholder="Monthly price" value={planForm.monthlyPrice} onChange={(e) => setPlanForm((p) => ({ ...p, monthlyPrice: e.target.value }))} />
            <Input placeholder="Yearly price" value={planForm.yearlyPrice} onChange={(e) => setPlanForm((p) => ({ ...p, yearlyPrice: e.target.value }))} />
            <Input type="number" placeholder="Max seats" value={planForm.maxSeats} onChange={(e) => setPlanForm((p) => ({ ...p, maxSeats: Number(e.target.value) }))} />
            <div className="grid gap-2">
              {features.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm"><input className="accent-green-500" type="checkbox" checked={planFeatureIds.includes(f.id)} onChange={(e) => setPlanFeatureIds((ids) => e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id))} /><span className="text-green-500">{f.name}</span></label>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button><Button onClick={() => savePlan.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={featureOpen} onOpenChange={setFeatureOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingFeatureId ? "Edit Feature" : "Create Feature"}</DialogTitle><DialogDescription>Manage the reusable feature catalog.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Input placeholder="Name" value={featureForm.name} onChange={(e) => setFeatureForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Key" value={featureForm.key} onChange={(e) => setFeatureForm((p) => ({ ...p, key: e.target.value }))} />
            <Input placeholder="Description" value={featureForm.description} onChange={(e) => setFeatureForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFeatureOpen(false)}>Cancel</Button><Button onClick={() => saveFeature.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tenantOpen} onOpenChange={setTenantOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Tenant</DialogTitle><DialogDescription>Assign a plan and billing cycle.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Select value={tenantForm.planId} onValueChange={(value) => setTenantForm((p) => ({ ...p, planId: value }))}>
              <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={tenantForm.status} onValueChange={(value) => setTenantForm((p) => ({ ...p, status: value }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="active">active</SelectItem><SelectItem value="trialing">trialing</SelectItem><SelectItem value="past_due">past_due</SelectItem><SelectItem value="canceled">canceled</SelectItem></SelectContent>
            </Select>
            <Select value={tenantForm.billingCycle} onValueChange={(value) => setTenantForm((p) => ({ ...p, billingCycle: value }))}>
              <SelectTrigger><SelectValue placeholder="Billing cycle" /></SelectTrigger>
              <SelectContent><SelectItem value="monthly">monthly</SelectItem><SelectItem value="yearly">yearly</SelectItem></SelectContent>
            </Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTenantOpen(false)}>Cancel</Button><Button onClick={() => saveTenant.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Super Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage pricing, features, and tenants.</p>
        </div>
      </div>
      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList>
          <TabsTrigger value="manage">Manage</TabsTrigger>
          <TabsTrigger value="billing">Billing Plans</TabsTrigger>
        </TabsList>
        <TabsContent value="manage"><ManageTab /></TabsContent>
        <TabsContent value="billing"><StripePlansTab /></TabsContent>
      </Tabs>
    </div>
  );
}
