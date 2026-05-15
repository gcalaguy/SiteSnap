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
  Copy,
  CreditCard,
  Crown,
  DatabaseZap,
  Gift,
  ShieldCheck,
  Star,
  Users,
  Zap,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#111111";

type Price = { id: string; unitAmount: number; currency: string; recurring: { interval: string } | null };
type StripePlanObj = { id: string; name: string; description: string; metadata: { plan?: string; slug?: string }; prices: Price[] };
type Plan = { id: number; name: string; slug: string; description: string | null; monthlyPrice: string; yearlyPrice: string; maxSeats: number; isActive: boolean; featureIds: number[] };
type Feature = { id: number; name: string; key: string; description: string | null; isEnabled: boolean };
type TenantRow = { id: number; name: string; subscription: { id: number; planId: number; status: string; billingCycle: string } | null; plan: { id: number; name: string; slug: string } | null; userCount: number };
type TenantDetail = TenantRow & { users: Array<{ id: number; email: string; firstName: string; lastName: string; role: string; systemRole: string | null }> };

type PlanDialogProps = { open: boolean };
type FeatureDialogProps = { open: boolean };
type MemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { firstName: string; lastName: string; email: string; role: string };
  onChange: (value: { firstName: string; lastName: string; email: string; role: string }) => void;
  onSave: () => void;
  isSaving: boolean;
};
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
  onEditTenantUser: (userId: number, role: string) => void;
  onDeleteTenantUser: (userId: number) => void;
  collapsed: { plans: boolean; features: boolean; tenants: boolean };
  setCollapsed: (value: { plans: boolean; features: boolean; tenants: boolean }) => void;
};

function formatCAD(cents: number) {
  return `$${(cents / 100).toFixed(0)} CAD`;
}

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-6 w-6 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-6 w-6 text-primary" />;
  if (planSlug === "business" || planSlug === "enterprise") return <Crown className="h-6 w-6 text-[#121212] font-bold" />;
  return <CreditCard className="h-6 w-6 text-muted-foreground" />;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 font-semibold">Active</Badge>;
  if (status === "trialing") return <Badge className="bg-blue-100 text-blue-700 font-semibold">Trial</Badge>;
  if (status === "past_due") return <Badge className="bg-[#D4AF37]/10 text-[#b5922e] font-semibold">Past Due</Badge>;
  if (status === "canceled") return <Badge className="bg-gray-100 text-gray-600 font-semibold">Canceled</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 font-semibold capitalize">{status}</Badge>;
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
        <h2 className="text-lg font-semibold text-[#121212]">Choose a Plan</h2>
        <div className="ml-auto flex items-center gap-1 rounded-lg p-1 bg-white border border-gray-200">
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setInterval(v)} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${interval === v ? "font-semibold" : "text-gray-500 hover:text-gray-700"}`} style={interval === v ? { background: GOLD, color: BLACK } : undefined}>
              {v === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <div className="h-40 rounded-xl bg-gray-100 animate-pulse" /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = plan.prices.find((p) => p.recurring?.interval === interval);
            const planSlug = (plan.metadata.plan ?? plan.metadata.slug ?? "").replace("business", "enterprise");
            const features = (dbPlans.find((p) => p.slug === planSlug)?.featureIds ?? []).map((id) => dbFeatures.find((f) => f.id === id)?.name).filter((name): name is string => Boolean(name));
            return (
              <Card key={plan.id} className="border-gray-200 bg-white text-[#121212]">
                <CardHeader>
                  <div className="flex items-center gap-3">{planIcon(planSlug)}<CardTitle>{plan.name}</CardTitle></div>
                  <CardDescription className="text-gray-500">{plan.description}</CardDescription>
                  <div className="text-3xl font-bold">{price ? formatCAD(price.unitAmount) : "—"}</div>
                </CardHeader>
                <CardContent>
                  <button onClick={() => setExpandedPlans((prev) => {
                    const next = new Set(prev);
                    next.has(plan.id.toString()) ? next.delete(plan.id.toString()) : next.add(plan.id.toString());
                    return next;
                  })} className="flex w-full items-center justify-between text-sm mb-2 text-gray-600 hover:text-[#121212]">
                    <span>{expandedPlans.has(plan.id.toString()) ? "Hide features" : `View ${features.length} features`}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedPlans.has(plan.id.toString()) ? "rotate-180" : ""}`} />
                  </button>
                  {expandedPlans.has(plan.id.toString()) && <div className="space-y-1">{features.map((f) => <div key={f} className="flex gap-2 text-sm text-gray-600"><CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />{f}</div>)}</div>}
                  <Separator className="my-3 bg-gray-200" />
                  <Button className="w-full" onClick={() => price && checkoutMut.mutate({ priceId: price.id })} disabled={!price || checkoutMut.isPending}>{checkoutMut.isPending ? "Redirecting…" : "Get Started"}</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <CreateCompanyCard />
    </div>
  );
}

function CreateCompanyCard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", province: "", city: "", phone: "" });
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const createCompany = useMutation({
    mutationFn: () => customFetch<{ id: number }>("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify({
        name: companyForm.name.trim(),
        province: companyForm.province.trim(),
        city: companyForm.city.trim(),
        phone: companyForm.phone.trim() || undefined,
      }),
    }),
    onSuccess: (data) => {
      const link = `${window.location.origin}/onboarding?companyId=${data.id}`;
      setCreatedLink(link);
      toast({ title: "Company created", description: "Share the link below with the new owner." });
    },
    onError: (err: any) => toast({ title: "Failed to create company", description: err?.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="rounded-xl p-5 border border-gray-200 bg-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-[#D4AF37]" /><span className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">Share Sign-up Link</span></div>
            <h3 className="text-lg font-semibold text-[#121212]">Invite a new subscriber</h3>
            <p className="text-sm text-gray-500 max-w-2xl">Create a new company and send a shareable link so the owner can sign up and claim it.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="border-white/20 text-[#121212] font-bold hover:bg-gray-50 bg-[#d4af37]" onClick={() => { setOpen(true); setCreatedLink(null); setCompanyForm({ name: "", province: "", city: "", phone: "" }); }}>Create New Company</Button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
            <h3 className="text-lg font-semibold text-[#121212]">Create New Company</h3>
            <p className="text-sm text-gray-500">Enter company details. A shareable link will be generated for the owner to claim it.</p>
            {createdLink ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-1">Shareable Link</div>
                  <div className="break-all text-sm text-[#121212]">{createdLink}</div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => { navigator.clipboard.writeText(createdLink); toast({ title: "Link copied to clipboard" }); }}><Copy className="h-4 w-4 mr-2" />Copy Link</Button>
                  <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => setOpen(false)}>Close</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => { const subject = encodeURIComponent("Set up your new company on Site Snap"); const body = encodeURIComponent(`Hi,\n\nYour company has been created on Site Snap. Click the link below to sign up and claim ownership:\n\n${createdLink}\n\nThanks.`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }}>Send via Email</Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <div><Label className="text-[#D4AF37]">Company Name</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} placeholder="Acme Construction" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[#D4AF37]">City</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.city} onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })} placeholder="Toronto" /></div>
                  <div><Label className="text-[#D4AF37]">Province</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.province} onChange={(e) => setCompanyForm({ ...companyForm, province: e.target.value })} placeholder="Ontario" /></div>
                </div>
                <div><Label className="text-[#D4AF37]">Phone</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} placeholder="(416) 555-0123" /></div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => createCompany.mutate()} disabled={createCompany.isPending || !companyForm.name.trim() || !companyForm.city.trim() || !companyForm.province.trim()}>{createCompany.isPending ? "Creating\u2026" : "Create & Generate Link"}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [memberForm, setMemberForm] = useState({ firstName: "", lastName: "", email: "", role: "worker" });
  const [collapsed, setCollapsed] = useState({ plans: true, features: true, tenants: true });

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
    onSuccess: () => { setTenantOpen(false); setEditingTenantId(null); setTenantDetailId(null); refresh(); toast({ title: "Tenant updated" }); },
    onError: (e: any) => toast({ title: "Tenant update failed", description: e.message, variant: "destructive" }),
  });
  const saveTenantUserRole = useMutation({
    mutationFn: ({ userId, role, companyId }: { userId: number; role: string; companyId: number }) => customFetch(`/api/admin/users/${userId}/company-role`, {
      method: "PATCH",
      body: JSON.stringify({ role, companyId }),
    }),
    onSuccess: () => { refresh(); setTenantDetailId((current) => current); toast({ title: "User role updated" }); },
    onError: (e: any) => toast({ title: "Role update failed", description: e.message, variant: "destructive" }),
  });
  const deleteTenantUser = useMutation({
    mutationFn: ({ userId, companyId }: { userId: number; companyId: number }) => customFetch(`/api/admin/tenants/${companyId}/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); setTenantDetailId((current) => current); toast({ title: "User removed from tenant" }); },
    onError: (e: any) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });
  const deleteTenant = useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/tenants/${id}`, { method: "DELETE" }), onSuccess: () => { setTenantOpen(false); setEditingTenantId(null); setTenantDetailId(null); refresh(); toast({ title: "Tenant deleted" }); }, onError: (e: any) => toast({ title: "Tenant delete failed", description: e.message, variant: "destructive" }) });
  const saveMember = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: { firstName: string; lastName: string; email: string } }) =>
      customFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { refresh(); setMemberOpen(false); setEditingMemberId(null); toast({ title: "Member updated" }); },
    onError: (e: any) => toast({ title: "Member update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <button className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:bg-gray-50 shadow-sm" onClick={() => setPlanOpen(true)}>
          <div className="flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-[#D4AF37]" /><span className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">Plan Administration</span></div>
          <h3 className="mt-2 text-lg font-semibold">Plans</h3>
          <p className="mt-1 text-sm text-gray-500">Create, edit, activate, or delete plan tiers.</p>
        </button>
        <button className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:bg-gray-50 shadow-sm" onClick={() => setFeatureOpen(true)}>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#D4AF37]" /><span className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">Feature Administration</span></div>
          <h3 className="mt-2 text-lg font-semibold">Features</h3>
          <p className="mt-1 text-sm text-gray-500">Create enabled/disabled features and assign them to plans.</p>
        </button>
        <button className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:bg-gray-50 shadow-sm" onClick={() => setTenantOpen(true)}>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#D4AF37]" /><span className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">Tenant Administration</span></div>
          <h3 className="mt-2 text-lg font-semibold">Tenants</h3>
          <p className="mt-1 text-sm text-gray-500">View tenant users, subscription state, and plan assignment.</p>
        </button>
      </div>

      <CreateCompanyCard />

      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList className="border border-gray-200 bg-white">
          <TabsTrigger value="manage" className="text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white">Manage</TabsTrigger>
          <TabsTrigger value="billing" className="text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white">Billing Plans</TabsTrigger>
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
            onEditTenantUser={(userId, role) => {
              const u = tenantDetail?.users.find((x) => x.id === userId);
              if (u) {
                setEditingMemberId(userId);
                setMemberForm({ firstName: u.firstName || "", lastName: u.lastName || "", email: u.email || "", role });
                setMemberOpen(true);
              }
            }}
            onDeleteTenantUser={(userId) => {
              if (tenantDetailId != null && confirm("Remove this user from the tenant?")) {
                deleteTenantUser.mutate({ userId, companyId: tenantDetailId });
              }
            }}
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
          if (selectedTenantUserId && editingTenantId != null) {
            saveTenantUserRole.mutate({ userId: Number(selectedTenantUserId), role: selectedTenantUserRole, companyId: editingTenantId });
          }
        }}
        isSaving={saveTenant.isPending || saveTenantUserRole.isPending}
        users={tenantDetail?.users}
      />
      <MemberDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        form={memberForm}
        onChange={setMemberForm}
        onSave={() => {
          if (editingMemberId != null && tenantDetailId != null) {
            saveMember.mutate({ userId: editingMemberId, payload: { firstName: memberForm.firstName, lastName: memberForm.lastName, email: memberForm.email } });
            if (memberForm.role) {
              saveTenantUserRole.mutate({ userId: editingMemberId, role: memberForm.role, companyId: tenantDetailId });
            }
          }
        }}
        isSaving={saveMember.isPending || saveTenantUserRole.isPending}
      />
    </div>
  );
}

function ManageAdminSections({ plans, features, tenants, tenantDetail, onOpenPlan, onOpenFeature, onOpenTenant, onSelectTenant, onEditPlan, onEditFeature, onEditTenant, onDeleteTenant, onEditTenantUser, onDeleteTenantUser, collapsed, setCollapsed }: ManageSectionsProps) {
  return (
    <div className="space-y-6">
      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, plans: !collapsed.plans })}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[#D4AF37]">Plans</CardTitle>
              <CardDescription className="text-gray-500">Create and manage plan tiers.</CardDescription>
            </div>
            <ChevronDown className={`h-5 w-5 text-[#D4AF37] transition-transform ${collapsed.plans ? "" : "rotate-180"}`} />
          </div>
        </CardHeader>
        {!collapsed.plans && <CardContent>
          <div className="space-y-2">
            {plans.map((p) => (
              <button key={p.id} onClick={() => onEditPlan(p)} className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left hover:bg-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#121212]">{p.name}</span>
                  <Badge className={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{p.isActive ? "Enabled" : "Disabled"}</Badge>
                </div>
                <div className="mt-1 text-xs text-gray-500">{p.slug} · {p.maxSeats} seats · {p.featureIds.length} features</div>
              </button>
            ))}
            <Button className="mt-3 bg-[#D4AF37] text-white font-bold hover:bg-[#b5922e]" onClick={onOpenPlan}>New Plan</Button>
          </div>
        </CardContent>}
      </Card>

      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, features: !collapsed.features })}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[#D4AF37]">Features</CardTitle>
              <CardDescription className="text-gray-500">Create feature flags and assign them to plans.</CardDescription>
            </div>
            <ChevronDown className={`h-5 w-5 text-[#D4AF37] transition-transform ${collapsed.features ? "" : "rotate-180"}`} />
          </div>
        </CardHeader>
        {!collapsed.features && <CardContent>
          <div className="space-y-2">
            {features.map((f) => (
              <button key={f.id} onClick={() => onEditFeature(f)} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#121212]">{f.name}</span>
                  <Badge className={f.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{f.isEnabled ? "Enabled" : "Disabled"}</Badge>
                </div>
                <div className="mt-1 text-xs text-gray-500">{f.key}</div>
              </button>
            ))}
            <Button className="mt-3 bg-[#D4AF37] text-white font-bold hover:bg-[#b5922e]" onClick={onOpenFeature}>New Feature</Button>
          </div>
        </CardContent>}
      </Card>

      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, tenants: !collapsed.tenants })}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[#D4AF37]">Tenants</CardTitle>
              <CardDescription className="text-gray-500">View tenants, subscription status, and clickable user emails.</CardDescription>
            </div>
            <ChevronDown className={`h-5 w-5 text-[#D4AF37] transition-transform ${collapsed.tenants ? "" : "rotate-180"}`} />
          </div>
        </CardHeader>
        {!collapsed.tenants && <CardContent>
          <div className="space-y-2">
            {tenants.map((t) => (
              <button key={t.id} onClick={() => { onSelectTenant(t.id); onEditTenant(t); }} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#121212]">{t.name}</span>
                  <span className="text-xs text-gray-500">{t.userCount} users</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">{t.plan?.name ?? "No plan"} · {t.subscription?.status ?? "No subscription"}</div>
              </button>
            ))}
            <Button className="mt-3 bg-[#D4AF37] text-white font-bold hover:bg-[#b5922e]" onClick={onOpenTenant}>Manage Tenant</Button>
          </div>
          {tenantDetail && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#121212]">{tenantDetail.name}</div>
                  <div className="text-xs text-gray-500">{tenantDetail.plan?.name ?? "No plan"} · {tenantDetail.subscription?.status ?? "No subscription"}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => onEditTenant(tenantDetail)}>Edit Tenant</Button>
                  <Button variant="outline" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => onDeleteTenant(tenantDetail)}>Delete Tenant</Button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {tenantDetail.users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="text-[#121212]">{u.firstName} {u.lastName}</div>
                      <span className="text-xs uppercase tracking-wider text-gray-500">{u.role}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a className="text-[#D4AF37] hover:text-[#b5922e]" href={`mailto:${u.email}`}>{u.email}</a>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs px-2" onClick={() => onEditTenantUser(u.id, u.role)}>Edit</Button>
                        <Button variant="outline" size="sm" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-7 text-xs px-2" onClick={() => onDeleteTenantUser(u.id)}>Delete</Button>
                      </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#121212]">Plan Administration</h3>
            <p className="text-sm text-gray-500">Create, edit, activate, or delete plan tiers.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label className="text-[#D4AF37]">Name</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Slug</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.slug} onChange={(e) => onChange({ ...form, slug: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Monthly Price</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.monthlyPrice} onChange={(e) => onChange({ ...form, monthlyPrice: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Yearly Price</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.yearlyPrice} onChange={(e) => onChange({ ...form, yearlyPrice: e.target.value })} /></div>
        </div>
        <div className="mt-4"><Label className="text-[#D4AF37]">Description</Label><Textarea className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} /></div>
        <div className="mt-4 flex justify-end gap-2">
          {onDelete && <Button variant="outline" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={onDelete} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete"}</Button>}
          <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={onCancel}>Cancel</Button>
          <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function FeatureDialog({ open, form, onChange, onSave, onCancel, isSaving }: FeatureDialogState) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
        <h3 className="text-lg font-semibold text-[#121212]">Feature Administration</h3>
        <p className="text-sm text-gray-500">Create enabled/disabled features and assign them to plans.</p>
        <div className="mt-4 grid gap-4">
          <div><Label className="text-[#D4AF37]">Name</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Key</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.key} onChange={(e) => onChange({ ...form, key: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Description</Label><Textarea className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={onCancel}>Cancel</Button><Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button></div>
      </div>
    </div>
  );
}

function TenantDialog({ open, onOpenChange, tenantId, tenantForm, setTenantForm, plans, users, selectedUserId, onSelectedUserIdChange, onSelectedUserRoleChange, onSave, isSaving }: TenantDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 pointer-events-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl pointer-events-auto">
        <h3 className="text-lg font-semibold text-[#121212]">Tenant Administration</h3>
        <p className="text-sm text-gray-500">Update tenant profile, subscription, billing cycle, and plan.</p>
        {tenantId !== null && <p className="mt-1 text-xs uppercase tracking-wider text-[#D4AF37]">Editing tenant #{tenantId}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-[#121212]">Tenant Name</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">Plan</Label>
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[#121212]"
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
            <Label className="text-[#121212]">Status</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.status} onChange={(e) => setTenantForm({ ...tenantForm, status: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">Billing Cycle</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.billingCycle} onChange={(e) => setTenantForm({ ...tenantForm, billingCycle: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">User Count</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.userCount} onChange={(e) => setTenantForm({ ...tenantForm, userCount: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">Website</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.website} onChange={(e) => setTenantForm({ ...tenantForm, website: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">Phone</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">Email</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={tenantForm.email} onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-[#121212]">User</Label>
            <select
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[#121212]"
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
            <Label className="text-[#121212]">Role</Label>
            <select
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[#121212]"
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
          <Button variant="outline" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function MemberDialog({ open, onOpenChange, form, onChange, onSave, isSaving }: MemberDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 pointer-events-auto">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl pointer-events-auto">
        <h3 className="text-lg font-semibold text-[#121212]">Edit Member</h3>
        <p className="text-sm text-gray-500">Update first name, last name, email, and company role.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-[#121212]">First Name</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.firstName} onChange={(e) => onChange({ ...form, firstName: e.target.value })} />
          </div>
          <div>
            <Label className="text-[#121212]">Last Name</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.lastName} onChange={(e) => onChange({ ...form, lastName: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[#121212]">Email</Label>
            <Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[#121212]">Role</Label>
            <select
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[#121212]"
              value={form.role}
              onChange={(e) => onChange({ ...form, role: e.target.value })}
            >
              <option value="owner">Owner</option>
              <option value="foreman">Foreman</option>
              <option value="worker">Worker</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#121212]"><ShieldCheck className="h-6 w-6 text-[#D4AF37]" /> Super Admin</h1>
        <p className="mt-1 text-sm text-gray-500">Manage plans, features, and tenants.</p>
      </div>
      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList className="border border-gray-200 bg-white">
          <TabsTrigger value="manage" className="text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white">Manage</TabsTrigger>
          <TabsTrigger value="billing" className="text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white">Billing Plans</TabsTrigger>
        </TabsList>
        <TabsContent value="manage"><ManageTab /></TabsContent>
        <TabsContent value="billing"><StripePlansTab /></TabsContent>
      </Tabs>
    </div>
  );
}
