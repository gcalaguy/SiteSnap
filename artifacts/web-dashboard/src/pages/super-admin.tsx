import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Crown,
  DatabaseZap,
  Gift,
  ShieldCheck,
  Star,
  Users,
  Zap,
} from "lucide-react";

const GOLD = "#C9A84C";
const BLACK = "#111111";

type Price = { id: string; unitAmount: number; currency: string; recurring: { interval: string } | null };
type StripePlanObj = { id: string; name: string; description: string; metadata: { plan?: string; slug?: string }; prices: Price[] };
type Plan = { id: number; name: string; slug: string; description: string | null; monthlyPrice: string; yearlyPrice: string; maxSeats: number; isActive: boolean; featureIds: number[] };
type Feature = { id: number; name: string; key: string; description: string | null; isEnabled: boolean };
type TenantRow = { id: number; name: string; subscription: { id: number; planId: number; status: string; billingCycle: string } | null; plan: { id: number; name: string; slug: string } | null; userCount: number };
type TenantDetail = TenantRow & { users: Array<{ id: number; email: string; firstName: string; lastName: string; role: string; systemRole: string | null }> };

type PlanDialogProps = { open: boolean };
type FeatureDialogProps = { open: boolean };
type TenantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number | null;
  tenantForm: { name: string; planId: string; status: string; billingCycle: string; userCount: string; website: string; phone: string; email: string };
  setTenantForm: (value: { name: string; planId: string; status: string; billingCycle: string; userCount: string; website: string; phone: string; email: string; selectedUserId?: string }) => void;
  plans: Plan[];
  users?: Array<{ id: number; email: string; firstName: string; lastName: string; role: string; systemRole: string | null }>;
  selectedUserId: string;
  onSelectedUserIdChange: (value: string) => void;
  onSelectedUserRoleChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
};
type PlanDialogState = {
  form: { name: string; slug: string; description: string; monthlyPrice: string; yearlyPrice: string; maxSeats: number; isActive: boolean };
  featureIds: number[];
  onChange: (value: { name: string; slug: string; description: string; monthlyPrice: string; yearlyPrice: string; maxSeats: number; isActive: boolean }) => void;
  onFeatureIdsChange: (value: number[]) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
  open: boolean;
};
type FeatureDialogState = {
  form: { name: string; key: string; description: string; isEnabled: boolean };
  onChange: (value: { name: string; key: string; description: string; isEnabled: boolean }) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  isDeleting?: boolean;
  open: boolean;
};

type ManageSectionsProps = {
  plans: Plan[];
  features: Feature[];
  tenants: TenantRow[];
  tenantDetail?: TenantDetail;
  onOpenPlan: () => void;
  onOpenFeature: () => void;
  onOpenTenant: () => void;
  onSelectTenant: (id: number) => void;
  onEditPlan: (plan: Plan) => void;
  onEditFeature: (feature: Feature) => void;
  onEditTenant: (tenant: TenantRow | TenantDetail) => void;
  onDeleteTenant: (tenant: TenantRow | TenantDetail) => void;
  collapsed: { plans: boolean; features: boolean; tenants: boolean };
  setCollapsed: (value: { plans: boolean; features: boolean; tenants: boolean }) => void;
};

function formatCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-6 w-6 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-6 w-6 text-primary" />;
  if (planSlug === "business" || planSlug === "enterprise") return <Crown className="h-6 w-6 text-white font-bold" />;
  return <CreditCard className="h-6 w-6 text-muted-foreground" />;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-600 text-white font-semibold">Active</Badge>;
  if (status === "trialing") return <Badge className="bg-blue-500 text-white font-semibold">Trial</Badge>;
  if (status === "past_due") return <Badge className="bg-amber-500 text-white font-semibold">Past Due</Badge>;
  if (status === "canceled") return <Badge className="bg-zinc-600 text-white font-semibold">Canceled</Badge>;
  return <Badge className="bg-zinc-700 text-white font-semibold capitalize">{status}</Badge>;
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
        <h2 className="text-lg font-semibold text-white">Choose a Plan</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg p-1 bg-black">
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setInterval(v)} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${interval === v ? "font-semibold" : "text-zinc-400 hover:text-zinc-200"}`} style={interval === v ? { background: GOLD, color: BLACK } : undefined}>
              {v === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <div className="h-40 rounded-xl bg-white/5 animate-pulse" /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = plan.prices.find((p) => p.recurring?.interval === interval);
            const planSlug = (plan.metadata.plan ?? plan.metadata.slug ?? "").replace("business", "enterprise");
            const features = (dbPlans.find((p) => p.slug === planSlug)?.featureIds ?? []).map((id) => dbFeatures.find((f) => f.id === id)?.name).filter((name): name is string => Boolean(name));
            return (
              <Card key={plan.id} className="border-white/10 bg-black text-white">
                <CardHeader>
                  <div className="flex items-center gap-3">{planIcon(planSlug)}<CardTitle>{plan.name}</CardTitle></div>
                  <CardDescription className="text-zinc-400">{plan.description}</CardDescription>
                  <div className="text-3xl font-bold">{price ? formatCAD(price.unitAmount) : "—"}</div>
                </CardHeader>
                <CardContent>
                  <button onClick={() => setExpandedPlans((prev) => {
                    const next = new Set(prev);
                    next.has(plan.id.toString()) ? next.delete(plan.id.toString()) : next.add(plan.id.toString());
                    return next;
                  })} className="flex w-full items-center justify-between text-sm mb-2 text-zinc-300 hover:text-white">
                    <span>{expandedPlans.has(plan.id.toString()) ? "Hide features" : `View ${features.length} features`}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedPlans.has(plan.id.toString()) ? "rotate-180" : ""}`} />
                  </button>
                  {expandedPlans.has(plan.id.toString()) && <div className="space-y-1">{features.map((f) => <div key={f} className="flex gap-2 text-sm text-zinc-200"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />{f}</div>)}</div>}
                  <Separator className="my-3 bg-white/10" />
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
            <Button variant="outline" className="border-white/20 text-white font-bold hover:bg-white/5" onClick={() => { const link = `${window.location.origin}/onboarding`; const subject = encodeURIComponent("Set up your new company on Site Snap"); const body = encodeURIComponent(`Hi,\n\nYou’re invited to join a new company as an owner in Site Snap.\n\nCreate your account here:\n${link}\n\nThanks.`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }}>Create New Company</Button>
          </div>
        </div>
      </div>
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
  const [planForm, setPlanForm] = useState({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5, isActive: true });
  const [featureForm, setFeatureForm] = useState({ name: "", key: "", description: "", isEnabled: true });
  const [tenantForm, setTenantForm] = useState({ name: "", planId: "", status: "active", billingCycle: "monthly", userCount: "", website: "", phone: "", email: "" });
  const [selectedTenantUserId, setSelectedTenantUserId] = useState("");
  const [selectedTenantUserRole, setSelectedTenantUserRole] = useState("worker");
  const [collapsed, setCollapsed] = useState({ plans: false, features: false, tenants: false });

  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["admin-plans"], queryFn: () => customFetch<Plan[]>("/api/admin/plans") });
  const { data: features = [] } = useQuery<Feature[]>({ queryKey: ["admin-features"], queryFn: () => customFetch<Feature[]>("/api/admin/features") });
  const { data: tenants = [] } = useQuery<TenantRow[]>({ queryKey: ["admin-tenants"], queryFn: () => customFetch<TenantRow[]>("/api/admin/tenants") });
  const { data: tenantDetail } = useQuery<TenantDetail>({ queryKey: ["admin-tenant-detail", tenantDetailId], queryFn: () => customFetch<TenantDetail>(`/api/admin/tenants/${tenantDetailId}`), enabled: tenantDetailId !== null });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
    qc.invalidateQueries({ queryKey: ["admin-features"] });
    qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    qc.invalidateQueries({ queryKey: ["admin-tenant-detail"] });
  };

  const savePlan = useMutation({
    mutationFn: async () => {
      const payload = { name: planForm.name.trim(), slug: planForm.slug.trim(), description: planForm.description.trim() || null, monthlyPrice: String(Number(planForm.monthlyPrice)), yearlyPrice: String(Number(planForm.yearlyPrice)), maxSeats: Number(planForm.maxSeats) || 5, isActive: planForm.isActive };
      return editingPlanId ? customFetch(`/api/admin/plans/${editingPlanId}`, { method: "PATCH", body: JSON.stringify(payload) }) : customFetch("/api/admin/plans", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (res: any) => {
      if (res?.id && planFeatureIds.length > 0) await customFetch(`/api/admin/plans/${res.id}/features`, { method: "PUT", body: JSON.stringify({ featureIds: planFeatureIds }) });
      setPlanOpen(false); setEditingPlanId(null); setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5, isActive: true }); setPlanFeatureIds([]); refresh(); toast({ title: "Plan saved" });
    },
    onError: (e: any) => toast({ title: "Plan save failed", description: e.message, variant: "destructive" }),
  });

  const deletePlan = useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/plans/${id}`, { method: "DELETE" }), onSuccess: () => { setPlanOpen(false); setEditingPlanId(null); setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5, isActive: true }); setPlanFeatureIds([]); refresh(); toast({ title: "Plan deleted" }); }, onError: (e: any) => toast({ title: "Plan delete failed", description: e.message, variant: "destructive" }) });
  const saveFeature = useMutation({ mutationFn: () => { const payload = { ...featureForm, description: featureForm.description || null }; return editingFeatureId ? customFetch(`/api/admin/features/${editingFeatureId}`, { method: "PATCH", body: JSON.stringify(payload) }) : customFetch("/api/admin/features", { method: "POST", body: JSON.stringify(payload) }); }, onSuccess: () => { setFeatureOpen(false); setEditingFeatureId(null); setFeatureForm({ name: "", key: "", description: "", isEnabled: true }); refresh(); toast({ title: "Feature saved" }); }, onError: (e: any) => toast({ title: "Feature save failed", description: e.message, variant: "destructive" }) });
  const saveTenant = useMutation({
    mutationFn: () => customFetch(`/api/admin/tenants/${editingTenantId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify({
        planId: tenantForm.planId ? Number(tenantForm.planId) : undefined,
        status: tenantForm.status,
        billingCycle: tenantForm.billingCycle,
      }),
    }),
    onSuccess: () => { setTenantOpen(false); setEditingTenantId(null); refresh(); toast({ title: "Tenant updated" }); },
    onError: (e: any) => toast({ title: "Tenant update failed", description: e.message, variant: "destructive" }),
  });
  const saveTenantUserRole = useMutation({
    mutationFn: () => customFetch(`/api/admin/users/${selectedTenantUserId}/company-role`, {
      method: "PATCH",
      body: JSON.stringify({ role: selectedTenantUserRole }),
    }),
    onSuccess: () => { refresh(); setTenantDetailId((current) => current); toast({ title: "User role updated" }); },
    onError: (e: any) => toast({ title: "Role update failed", description: e.message, variant: "destructive" }),
  });
  const deleteTenant = useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/tenants/${id}`, { method: "DELETE" }), onSuccess: () => { setTenantOpen(false); setEditingTenantId(null); setTenantDetailId(null); refresh(); toast({ title: "Tenant deleted" }); }, onError: (e: any) => toast({ title: "Tenant delete failed", description: e.message, variant: "destructive" }) });

  return (
    <div className="space-y-6 bg-black text-white">
      <div className="grid gap-4 md:grid-cols-3">
        <button className="rounded-xl border border-amber-400/20 bg-zinc-950 p-5 text-left transition-colors hover:bg-zinc-900" onClick={() => setPlanOpen(true)}>
          <div className="flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Plan Administration</span></div>
          <h3 className="mt-2 text-lg font-semibold">Plans</h3>
          <p className="mt-1 text-sm text-zinc-300">Create, edit, activate, or delete plan tiers.</p>
        </button>
        <button className="rounded-xl border border-amber-400/20 bg-zinc-950 p-5 text-left transition-colors hover:bg-zinc-900" onClick={() => setFeatureOpen(true)}>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Feature Administration</span></div>
          <h3 className="mt-2 text-lg font-semibold">Features</h3>
          <p className="mt-1 text-sm text-zinc-300">Create enabled/disabled features and assign them to plans.</p>
        </button>
        <button className="rounded-xl border border-amber-400/20 bg-zinc-950 p-5 text-left transition-colors hover:bg-zinc-900" onClick={() => setTenantOpen(true)}>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Tenant Administration</span></div>
          <h3 className="mt-2 text-lg font-semibold">Tenants</h3>
          <p className="mt-1 text-sm text-zinc-300">View tenant users, subscription state, and plan assignment.</p>
        </button>
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-zinc-950 p-5 shadow-lg shadow-amber-400/5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><Gift className="h-4 w-4" style={{ color: GOLD }} /><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Share Sign-up Link</span></div>
            <h3 className="text-lg font-semibold text-white">Invite a new subscriber</h3>
            <p className="max-w-2xl text-sm text-zinc-300">Send this link by email or copy it to share so they can create a new company.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10" onClick={() => { const link = `${window.location.origin}/onboarding`; const subject = encodeURIComponent("Set up your new company on Site Snap"); const body = encodeURIComponent(`Use this link to set up your account and company on Site Snap:\n\n${link}`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }}>Create New Company</Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList className="border border-amber-400/20 bg-zinc-950">
          <TabsTrigger value="manage" className="text-white data-[state=active]:bg-amber-400 data-[state=active]:text-black">Manage</TabsTrigger>
          <TabsTrigger value="billing" className="text-white data-[state=active]:bg-amber-400 data-[state=active]:text-black">Billing Plans</TabsTrigger>
        </TabsList>
        <TabsContent value="manage">
          <ManageAdminSections
            plans={plans}
            features={features}
            tenants={tenants}
            tenantDetail={tenantDetail}
            onOpenPlan={() => setPlanOpen(true)}
            onOpenFeature={() => setFeatureOpen(true)}
            onOpenTenant={() => setTenantOpen(true)}
            onSelectTenant={setTenantDetailId}
            onEditPlan={(p) => { setEditingPlanId(p.id); setPlanForm({ name: p.name, slug: p.slug, description: p.description ?? "", monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, maxSeats: p.maxSeats, isActive: p.isActive }); setPlanFeatureIds(p.featureIds); setPlanOpen(true); }}
            onEditFeature={(f) => { setEditingFeatureId(f.id); setFeatureForm({ name: f.name, key: f.key, description: f.description ?? "", isEnabled: f.isEnabled }); setFeatureOpen(true); }}
            onEditTenant={(t) => { setEditingTenantId(t.id); setSelectedTenantUserId(""); setSelectedTenantUserRole("worker"); setTenantForm({ name: t.name, planId: t.plan?.id ? String(t.plan.id) : "", status: t.subscription?.status ?? "active", billingCycle: t.subscription?.billingCycle ?? "monthly", userCount: String(t.userCount ?? ""), website: "", phone: "", email: "" }); setTenantOpen(true); }}
            onDeleteTenant={(t) => deleteTenant.mutate(t.id)}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        </TabsContent>
        <TabsContent value="billing"><StripePlansTab /></TabsContent>
      </Tabs>

      <PlanDialog
        open={planOpen}
        form={planForm}
        featureIds={planFeatureIds}
        onChange={setPlanForm}
        onFeatureIdsChange={setPlanFeatureIds}
        onSave={() => savePlan.mutate()}
        onCancel={() => { setPlanOpen(false); setEditingPlanId(null); setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5, isActive: true }); setPlanFeatureIds([]); }}
        onDelete={editingPlanId ? () => deletePlan.mutate(editingPlanId) : undefined}
        isSaving={savePlan.isPending}
        isDeleting={deletePlan.isPending}
      />
      <FeatureDialog
        open={featureOpen}
        form={featureForm}
        onChange={setFeatureForm}
        onSave={() => saveFeature.mutate()}
        onCancel={() => { setFeatureOpen(false); setEditingFeatureId(null); setFeatureForm({ name: "", key: "", description: "", isEnabled: true }); }}
        onDelete={undefined}
        isSaving={saveFeature.isPending}
      />
      <TenantDialog
        open={tenantOpen}
        onOpenChange={setTenantOpen}
        tenantId={editingTenantId}
        tenantForm={tenantForm}
        setTenantForm={setTenantForm}
        plans={plans}
        selectedUserId={selectedTenantUserId}
        onSelectedUserIdChange={(id) => {
          setSelectedTenantUserId(id);
          setSelectedTenantUserRole(tenantDetail?.users.find((user: { id: number; email: string; firstName: string; lastName: string; role: string; systemRole: string | null }) => String(user.id) === id)?.role ?? "worker");
        }}
        onSelectedUserRoleChange={(role) => {
          setSelectedTenantUserRole(role);
          setTenantDetailId((current) => current);
        }}
        onSave={() => {
          saveTenant.mutate();
          if (selectedTenantUserId) {
            saveTenantUserRole.mutate();
          }
        }}
        isSaving={saveTenant.isPending}
        users={tenantDetail?.users}
      />
    </div>
  );
}

function ManageAdminSections({ plans, features, tenants, tenantDetail, onOpenPlan, onOpenFeature, onOpenTenant, onSelectTenant, onEditPlan, onEditFeature, onEditTenant, onDeleteTenant, collapsed, setCollapsed }: ManageSectionsProps) {
  return (
    <div className="space-y-6">
      <Card className="border-amber-400/20 bg-zinc-950 text-white">
        <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, plans: !collapsed.plans })}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-amber-400">Plans</CardTitle>
              <CardDescription className="text-zinc-400">Create and manage plan tiers.</CardDescription>
            </div>
            <ChevronDown className={`h-5 w-5 text-amber-400 transition-transform ${collapsed.plans ? "" : "rotate-180"}`} />
          </div>
        </CardHeader>
        {!collapsed.plans && <CardContent>
          <div className="space-y-2">
            {plans.map((p) => (
              <button key={p.id} onClick={() => onEditPlan(p)} className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{p.name}</span>
                  <Badge className={p.isActive ? "bg-green-600 text-white" : "bg-zinc-600 text-white"}>{p.isActive ? "Enabled" : "Disabled"}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-400">{p.slug} · {p.maxSeats} seats · {p.featureIds.length} features</div>
              </button>
            ))}
            <Button className="mt-3 bg-white text-black font-bold hover:bg-zinc-200" onClick={onOpenPlan}>New Plan</Button>
          </div>
        </CardContent>}
      </Card>

      <Card className="border-amber-400/20 bg-zinc-950 text-white">
        <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, features: !collapsed.features })}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-amber-400">Features</CardTitle>
              <CardDescription className="text-zinc-400">Create feature flags and assign them to plans.</CardDescription>
            </div>
            <ChevronDown className={`h-5 w-5 text-amber-400 transition-transform ${collapsed.features ? "" : "rotate-180"}`} />
          </div>
        </CardHeader>
        {!collapsed.features && <CardContent>
          <div className="space-y-2">
            {features.map((f) => (
              <button key={f.id} onClick={() => onEditFeature(f)} className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{f.name}</span>
                  <Badge className={f.isEnabled ? "bg-green-600 text-white" : "bg-zinc-600 text-white"}>{f.isEnabled ? "Enabled" : "Disabled"}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-400">{f.key}</div>
              </button>
            ))}
            <Button className="mt-3 bg-white text-black font-bold hover:bg-zinc-200" onClick={onOpenFeature}>New Feature</Button>
          </div>
        </CardContent>}
      </Card>

      <Card className="border-amber-400/20 bg-zinc-950 text-white">
        <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, tenants: !collapsed.tenants })}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-amber-400">Tenants</CardTitle>
              <CardDescription className="text-zinc-400">View tenants, subscription status, and clickable user emails.</CardDescription>
            </div>
            <ChevronDown className={`h-5 w-5 text-amber-400 transition-transform ${collapsed.tenants ? "" : "rotate-180"}`} />
          </div>
        </CardHeader>
        {!collapsed.tenants && <CardContent>
          <div className="space-y-2">
            {tenants.map((t) => (
              <button key={t.id} onClick={() => { onSelectTenant(t.id); onEditTenant(t); }} className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{t.name}</span>
                  <span className="text-xs text-zinc-400">{t.userCount} users</span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">{t.plan?.name ?? "No plan"} · {t.subscription?.status ?? "No subscription"}</div>
              </button>
            ))}
            <Button className="mt-3 bg-white text-black font-bold hover:bg-zinc-200" onClick={onOpenTenant}>Manage Tenant</Button>
          </div>
          {tenantDetail && (
            <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{tenantDetail.name}</div>
                  <div className="text-xs text-zinc-400">{tenantDetail.plan?.name ?? "No plan"} · {tenantDetail.subscription?.status ?? "No subscription"}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => onEditTenant(tenantDetail)}>Edit Tenant</Button>
                  <Button variant="outline" className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10" onClick={() => onDeleteTenant(tenantDetail)}>Delete Tenant</Button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {tenantDetail.users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm">
                    <div className="text-white">{u.firstName} {u.lastName}</div>
                    <div className="flex items-center gap-3">
                      <a className="text-amber-400 hover:text-amber-300" href={`mailto:${u.email}`}>{u.email}</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>}
      </Card>
    </div>
  );
}

function PlanDialog({ open, form, featureIds, onChange, onFeatureIdsChange, onSave, onCancel, onDelete, isSaving, isDeleting }: PlanDialogState) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-400/20 bg-zinc-950 p-6 text-white shadow-2xl shadow-amber-400/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Plan Administration</h3>
            <p className="text-sm text-zinc-300">Create, edit, activate, or delete plan tiers.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label className="text-amber-400">Name</Label><Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} /></div>
          <div><Label className="text-amber-400">Slug</Label><Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.slug} onChange={(e) => onChange({ ...form, slug: e.target.value })} /></div>
          <div><Label className="text-amber-400">Monthly Price</Label><Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.monthlyPrice} onChange={(e) => onChange({ ...form, monthlyPrice: e.target.value })} /></div>
          <div><Label className="text-amber-400">Yearly Price</Label><Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.yearlyPrice} onChange={(e) => onChange({ ...form, yearlyPrice: e.target.value })} /></div>
        </div>
        <div className="mt-4"><Label className="text-amber-400">Description</Label><Textarea className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} /></div>
        <div className="mt-4 flex justify-end gap-2">
          {onDelete && <Button variant="outline" className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10" onClick={onDelete} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete"}</Button>}
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={onCancel}>Cancel</Button>
          <Button className="bg-white text-black hover:bg-zinc-200" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function FeatureDialog({ open, form, onChange, onSave, onCancel, isSaving }: FeatureDialogState) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-amber-400/20 bg-zinc-950 p-6 text-white shadow-2xl shadow-amber-400/10">
        <h3 className="text-lg font-semibold text-white">Feature Administration</h3>
        <p className="text-sm text-zinc-300">Create enabled/disabled features and assign them to plans.</p>
        <div className="mt-4 grid gap-4">
          <div><Label className="text-amber-400">Name</Label><Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} /></div>
          <div><Label className="text-amber-400">Key</Label><Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.key} onChange={(e) => onChange({ ...form, key: e.target.value })} /></div>
          <div><Label className="text-amber-400">Description</Label><Textarea className="border-amber-400/20 bg-black text-white placeholder:text-zinc-600 focus:border-amber-400" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={onCancel}>Cancel</Button><Button className="bg-white text-black hover:bg-zinc-200" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button></div>
      </div>
    </div>
  );
}

function TenantDialog({ open, onOpenChange, tenantId, tenantForm, setTenantForm, plans, users, selectedUserId, onSelectedUserIdChange, onSelectedUserRoleChange, onSave, isSaving }: TenantDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-amber-400/30 bg-black p-6 text-white shadow-2xl pointer-events-auto">
        <h3 className="text-lg font-semibold text-white">Tenant Administration</h3>
        <p className="text-sm text-zinc-400">Update tenant profile, subscription, billing cycle, and plan.</p>
        {tenantId !== null && <p className="mt-1 text-xs uppercase tracking-wider text-amber-400">Editing tenant #{tenantId}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-white">Tenant Name</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-white">Plan</Label>
            <select
              className="w-full rounded-md border border-amber-400/20 bg-black px-3 py-2 text-white"
              value={tenantForm.planId}
              onChange={(e) => setTenantForm({ ...tenantForm, planId: e.target.value })}
            >
              <option value="">No plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-white">Status</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.status} onChange={(e) => setTenantForm({ ...tenantForm, status: e.target.value })} />
          </div>
          <div>
            <Label className="text-white">Billing Cycle</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.billingCycle} onChange={(e) => setTenantForm({ ...tenantForm, billingCycle: e.target.value })} />
          </div>
          <div>
            <Label className="text-white">User Count</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.userCount} onChange={(e) => setTenantForm({ ...tenantForm, userCount: e.target.value })} />
          </div>
          <div>
            <Label className="text-white">Website</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.website} onChange={(e) => setTenantForm({ ...tenantForm, website: e.target.value })} />
          </div>
          <div>
            <Label className="text-white">Phone</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-white">Email</Label>
            <Input className="border-amber-400/20 bg-black text-white placeholder:text-zinc-500" value={tenantForm.email} onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-white">User</Label>
            <select
              className="w-full rounded-md border border-amber-400/20 bg-black px-3 py-2 text-white"
              value={selectedUserId}
              onChange={(e) => onSelectedUserIdChange(e.target.value)}
            >
              <option value="">Select user</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>{user.firstName} {user.lastName} · {user.email} · {user.role}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-white">Role</Label>
            <select
              className="w-full rounded-md border border-amber-400/20 bg-black px-3 py-2 text-white"
              value={users?.find((user) => String(user.id) === selectedUserId)?.role ?? "worker"}
              onChange={(e) => onSelectedUserRoleChange(e.target.value)}
              disabled={!selectedUserId}
            >
              <option value="owner">Owner</option>
              <option value="foreman">Foreman</option>
              <option value="worker">Worker</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-amber-400 text-black hover:bg-amber-300" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminPage() {
  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white"><ShieldCheck className="h-6 w-6 text-amber-400" /> Super Admin</h1>
        <p className="mt-1 text-sm text-zinc-400">Manage plans, features, and tenants.</p>
      </div>
      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList className="border border-amber-400/20 bg-black">
          <TabsTrigger value="manage" className="text-white data-[state=active]:bg-amber-400 data-[state=active]:text-black">Manage</TabsTrigger>
          <TabsTrigger value="billing" className="text-white data-[state=active]:bg-amber-400 data-[state=active]:text-black">Billing Plans</TabsTrigger>
        </TabsList>
        <TabsContent value="manage"><ManageTab /></TabsContent>
        <TabsContent value="billing"><StripePlansTab /></TabsContent>
      </Tabs>
    </div>
  );
}
