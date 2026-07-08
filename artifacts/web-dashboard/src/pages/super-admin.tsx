import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  BarChart3,
  Bug,
  Building2,
  CheckCircle2,
  ChevronDown,
  Copy,
  CreditCard,
  Crown,
  DatabaseZap,
  DollarSign,
  Gift,
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";

type Plan = { id: number; name: string; slug: string; description: string | null; monthlyPrice: string; yearlyPrice: string; maxSeats: number; isActive: boolean; featureIds: number[] };
type Feature = { id: number; name: string; key: string; description: string | null; isEnabled: boolean };
type TenantRow = { id: number; name: string; subscription: { id: number; planId: number; status: string; billingCycle: string } | null; plan: { id: number; name: string; slug: string } | null; userCount: number; claimToken?: string | null; claimOwnerEmail?: string | null };
type TenantDetail = TenantRow & {
  users: Array<{ id: number; email: string; firstName: string; lastName: string; role: string; systemRole: string | null }>;
  claimToken?: string | null;
  claimOwnerEmail?: string | null;
};

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

function formatCAD(cents: number) {
  return `${formatCurrency(cents / 100, { maximumFractionDigits: 0 })} CAD`;
}

function planIcon(planSlug: string | undefined) {
  if (planSlug === "starter") return <Zap className="h-4 w-4 text-blue-500" />;
  if (planSlug === "pro") return <Star className="h-4 w-4 text-[#D4AF37]" />;
  if (planSlug === "business" || planSlug === "enterprise") return <Crown className="h-4 w-4 text-[#121212]" />;
  return <CreditCard className="h-4 w-4 text-gray-400" />;
}

function tierBadgeClasses(slug?: string | null) {
  switch (slug) {
    case "starter": return "bg-blue-100 text-blue-700";
    case "basic": return "bg-purple-100 text-purple-700";
    case "pro": return "bg-[#D4AF37]/15 text-[#8a6d1f]";
    case "enterprise":
    case "business": return "bg-[#121212] text-[#D4AF37]";
    default: return "bg-gray-100 text-gray-500";
  }
}

function statusDotClasses(status?: string | null) {
  if (status === "active") return "bg-green-500";
  if (status === "trialing") return "bg-blue-500";
  if (status === "past_due") return "bg-amber-500";
  if (status === "canceled") return "bg-red-500";
  return "bg-gray-300";
}

function statusBadgeClasses(status?: string | null) {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "trialing") return "bg-blue-100 text-blue-700";
  if (status === "past_due") return "bg-amber-100 text-amber-700";
  if (status === "canceled") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

// Triggers a browser download of the tenant export ZIP and returns the
// receipt id the follow-up DELETE call must present. Uses raw fetch (not
// customFetch) so the response headers are readable alongside the blob body,
// matching the download pattern in hooks/cor-compliance/useAuditPackages.ts.
async function exportTenantData(companyId: number, tenantName: string): Promise<{ receiptId: number }> {
  const response = await fetch(`/api/admin/tenants/${companyId}/export`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const err: unknown = await response.json().catch(() => null);
    const message = err && typeof err === "object" && "error" in err ? String((err as { error: unknown }).error) : `Export failed (${response.status})`;
    throw new Error(message);
  }
  const receiptId = Number(response.headers.get("X-Export-Receipt-Id"));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `${tenantName.replace(/[^a-zA-Z0-9._-]/g, "_")}_export_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { receiptId };
}

// ── Invite Generator ─────────────────────────────────────────────────────────

function CreateCompanyCard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showRegional, setShowRegional] = useState(false);
  const [companyForm, setCompanyForm] = useState({ province: "", city: "", ownerEmail: "" });
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const createCompany = useMutation({
    mutationFn: () => customFetch<{ id: number; claimToken?: string | null }>("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify({
        province: companyForm.province.trim() || undefined,
        city: companyForm.city.trim() || undefined,
        ownerEmail: companyForm.ownerEmail.trim(),
      }),
    }),
    onSuccess: (data) => {
      const link = data.claimToken
        ? `${window.location.origin}/sign-up?token=${data.claimToken}`
        : `${window.location.origin}/onboarding?companyId=${data.id}`;
      setCreatedLink(link);
      toast({ title: "Invite sent", description: `Invite email sent to ${companyForm.ownerEmail.trim()}. You can also share the link below directly.` });
    },
    onError: (err: ApiError) => toast({ title: "Failed to create invite", description: err?.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-[#D4AF37]" /><span className="text-xs font-extrabold uppercase tracking-wider text-[#D4AF37]">Share Sign-up Link</span></div>
            <h3 className="text-lg font-semibold text-[#121212]">Invite a new subscriber</h3>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">Send a one-time claim link to the owner's email. They'll set up their company profile and plan when they claim it.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/20 bg-[#d4af37] font-bold text-[#121212] hover:bg-gray-50" onClick={() => { setOpen(true); setCreatedLink(null); setShowRegional(false); setCompanyForm({ province: "", city: "", ownerEmail: "" }); }}>Create New Company</Button>
          </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
            <h3 className="text-lg font-semibold text-[#121212]">Create New Company</h3>
            <p className="text-sm font-semibold text-gray-500">Enter the owner's email. A shareable link will be generated for them to claim and set up their company.</p>
            {createdLink ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-green-600">Invite email sent — link below as a backup</div>
                  <div className="break-all text-sm text-[#121212]">{createdLink}</div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => { navigator.clipboard.writeText(createdLink); toast({ title: "Link copied to clipboard" }); }}><Copy className="mr-2 h-4 w-4" />Copy Link</Button>
                  <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => setOpen(false)}>Close</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => { const subject = encodeURIComponent("Set up your new company on Site Snap"); const body = encodeURIComponent(`Hi,\n\nYou've been invited to set up your company on Site Snap. Click the link below to sign up and claim ownership:\n\n${createdLink}\n\nThanks.`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }}>Resend Manually</Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <div><Label className="text-[#D4AF37]">Owner Email</Label><Input type="email" className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.ownerEmail} onChange={(e) => setCompanyForm({ ...companyForm, ownerEmail: e.target.value })} placeholder="owner@example.com" /></div>
                <div>
                  <button type="button" className="text-xs font-semibold text-[#D4AF37] hover:underline" onClick={() => setShowRegional((v) => !v)}>{showRegional ? "Hide" : "Add"} regional routing (optional)</button>
                  {showRegional && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div><Label className="text-[#D4AF37]">City</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.city} onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })} placeholder="Toronto" /></div>
                      <div><Label className="text-[#D4AF37]">Province</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={companyForm.province} onChange={(e) => setCompanyForm({ ...companyForm, province: e.target.value })} placeholder="Ontario" /></div>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => createCompany.mutate()} disabled={createCompany.isPending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyForm.ownerEmail.trim())}>{createCompany.isPending ? "Creating…" : "Create & Send Invite"}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InviteGeneratorTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">Invite Generator</h2>
        <p className="mt-1 text-sm text-gray-500">Spin up a new company tenant and generate a one-time claim link for its owner.</p>
      </div>
      <CreateCompanyCard />
    </div>
  );
}

// ── Tenant Directory (master-detail) ─────────────────────────────────────────

function TenantFeaturesEditor({
  tenantId,
  features,
  planFeatureIds,
  initialActiveFeatures,
}: {
  tenantId: number;
  features: Feature[];
  planFeatureIds: number[];
  initialActiveFeatures: string[] | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const planKeys = features.filter((f) => planFeatureIds.includes(f.id)).map((f) => f.key);
  const [customized, setCustomized] = useState(initialActiveFeatures != null);
  const [selected, setSelected] = useState<string[]>(initialActiveFeatures ?? planKeys);

  const save = useMutation({
    mutationFn: (activeFeatures: string[] | null) => customFetch(`/api/admin/tenants/${tenantId}/features`, { method: "PATCH", body: JSON.stringify({ activeFeatures }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tenant-features", tenantId] }); toast({ title: "Tenant features updated" }); },
    onError: (e: ApiError) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  if (!customized) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-4 text-sm text-gray-500">
        <p>This tenant currently uses the default features included in its plan.</p>
        <Button size="sm" variant="outline" className="mt-3 border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => setCustomized(true)}>Customize for this tenant</Button>
      </div>
    );
  }

  if (features.length === 0) {
    return <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-4 text-center text-sm text-gray-500">No features exist yet.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {features.map((f) => (
          <label key={f.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
            <span className="text-[#121212]">{f.name}</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
              checked={selected.includes(f.key)}
              onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, f.key] : prev.filter((k) => k !== f.key)))}
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => { setCustomized(false); setSelected(planKeys); save.mutate(null); }}>Reset to plan defaults</Button>
        <Button size="sm" className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => save.mutate(selected)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function TenantFeaturesPanel({ tenantId, features, planFeatureIds }: { tenantId: number; features: Feature[]; planFeatureIds: number[] }) {
  const { data, isLoading } = useQuery<{ activeFeatures: string[] | null }>({
    queryKey: ["admin-tenant-features", tenantId],
    queryFn: () => customFetch(`/api/admin/tenants/${tenantId}/features`),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-6 rounded bg-gray-100 animate-pulse" />)}
      </div>
    );
  }

  return <TenantFeaturesEditor tenantId={tenantId} features={features} planFeatureIds={planFeatureIds} initialActiveFeatures={data.activeFeatures} />;
}

function ClaimTokenPanel({ tenant, onReissue, isReissuing }: { tenant: TenantDetail; onReissue: () => void; isReissuing: boolean }) {
  const { toast } = useToast();
  const claimed = !tenant.claimToken;
  const link = tenant.claimToken ? `${window.location.origin}/sign-up?token=${tenant.claimToken}` : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={claimed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>{claimed ? "Claimed" : "Pending Claim"}</Badge>
        {claimed && tenant.claimOwnerEmail && <span className="text-xs text-gray-500">by {tenant.claimOwnerEmail}</span>}
      </div>
      {link ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="break-all text-xs text-[#121212]">{link}</div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => { navigator.clipboard.writeText(link); toast({ title: "Link copied to clipboard" }); }}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</Button>
            <Button size="sm" variant="outline" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={onReissue} disabled={isReissuing}>{isReissuing ? "Reissuing…" : "Reissue"}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-500">
          Ownership has been claimed. Generate a new link if you need to transfer ownership.
          <div className="mt-2">
            <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={onReissue} disabled={isReissuing}>{isReissuing ? "Generating…" : "Generate New Link"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

type TenantDirectoryTabProps = {
  tenants: TenantRow[];
  plans: Plan[];
  features: Feature[];
  tenantDetail?: TenantDetail;
  tenantDetailId: number | null;
  onSelectTenant: (id: number) => void;
  onEditTenant: (tenant: TenantDetail) => void;
  onDeleteTenant: (tenant: TenantDetail) => void;
  onReissueLink: (tenant: TenantDetail) => void;
  isReissuing: boolean;
  onEditTenantUser: (userId: number, role: string) => void;
  onDeleteTenantUser: (userId: number) => void;
  onGoToInvite: () => void;
};

function TenantDirectoryTab({
  tenants,
  plans,
  features,
  tenantDetail,
  tenantDetailId,
  onSelectTenant,
  onEditTenant,
  onDeleteTenant,
  onReissueLink,
  isReissuing,
  onEditTenantUser,
  onDeleteTenantUser,
  onGoToInvite,
}: TenantDirectoryTabProps) {
  const [query, setQuery] = useState("");
  const filtered = tenants.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
      {/* Left: high-density tenant list */}
      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-[#121212]">Tenant Directory</CardTitle>
          <CardDescription className="text-gray-500">{tenants.length} compan{tenants.length === 1 ? "y" : "ies"}</CardDescription>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input className="border-gray-300 bg-white pl-8 text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" placeholder="Search tenants…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-10 text-center">
              <Building2 className="h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-[#121212]">No tenants yet</p>
              <p className="mt-1 text-xs text-gray-500">Create your first company to get started.</p>
              <Button size="sm" className="mt-3 bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={onGoToInvite}>Invite a Company</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-gray-500">No tenants match "{query}".</div>
          ) : (
            <ScrollArea className="h-[65vh] pr-2">
              <div className="space-y-1.5">
                {filtered.map((t) => {
                  const selected = t.id === tenantDetailId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onSelectTenant(t.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selected ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-transparent hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[#121212]">{t.claimToken ? (t.claimOwnerEmail ?? "Invite Pending") : t.name}</span>
                        {t.claimToken ? (
                          <Badge className="shrink-0 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-700">Invite Pending</Badge>
                        ) : (
                          <Badge className={`shrink-0 px-1.5 py-0 text-[10px] ${tierBadgeClasses(t.plan?.slug)}`}>{t.plan?.name ?? "No Plan"}</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotClasses(t.subscription?.status)}`} />
                        <span className="capitalize">{t.subscription?.status ?? "no subscription"}</span>
                        <span>·</span>
                        <span>{t.userCount} user{t.userCount === 1 ? "" : "s"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Right: dynamic tenant control panel */}
      {!tenantDetail ? (
        <div className="flex min-h-[65vh] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
          <Building2 className="h-10 w-10 text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-[#121212]">Select a tenant</h3>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Choose a company from the directory to manage its features, claim tokens, and users.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#121212]">{tenantDetail.claimToken ? (tenantDetail.claimOwnerEmail ?? "Invite Pending") : tenantDetail.name}</h2>
                {tenantDetail.claimToken ? (
                  <Badge className="bg-amber-100 text-amber-700">Invite Pending</Badge>
                ) : (
                  <>
                    <Badge className={tierBadgeClasses(tenantDetail.plan?.slug)}>{tenantDetail.plan?.name ?? "No Plan"}</Badge>
                    <Badge className={statusBadgeClasses(tenantDetail.subscription?.status)}>{tenantDetail.subscription?.status ?? "No subscription"}</Badge>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">{tenantDetail.userCount} user{tenantDetail.userCount === 1 ? "" : "s"} · billing {tenantDetail.subscription?.billingCycle ?? "—"}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => onEditTenant(tenantDetail)}>Edit Tenant</Button>
              <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => onDeleteTenant(tenantDetail)}>Delete</Button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-gray-200 bg-white text-[#121212]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-[#D4AF37]" /><CardTitle className="text-sm font-extrabold text-[#D4AF37]">Manage Features</CardTitle></div>
                <CardDescription className="text-gray-500">Override the plan's default features for this tenant only.</CardDescription>
              </CardHeader>
              <CardContent>
                <TenantFeaturesPanel key={tenantDetail.id} tenantId={tenantDetail.id} features={features} planFeatureIds={plans.find((p) => p.id === tenantDetail.plan?.id)?.featureIds ?? []} />
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-white text-[#121212]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#D4AF37]" /><CardTitle className="text-sm font-extrabold text-[#D4AF37]">Claim Token</CardTitle></div>
                <CardDescription className="text-gray-500">Manage this tenant's ownership sign-up link.</CardDescription>
              </CardHeader>
              <CardContent>
                <ClaimTokenPanel key={tenantDetail.id} tenant={tenantDetail} onReissue={() => onReissueLink(tenantDetail)} isReissuing={isReissuing} />
              </CardContent>
            </Card>
          </div>

          <Card className="border-gray-200 bg-white text-[#121212]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#D4AF37]" /><CardTitle className="text-sm font-extrabold text-[#D4AF37]">User Management</CardTitle></div>
              <CardDescription className="text-gray-500">Members with access to this tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              {tenantDetail.users.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">No users on this tenant yet.</div>
              ) : (
                <div className="space-y-2">
                  {tenantDetail.users.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="text-[#121212]">{u.firstName} {u.lastName}</div>
                        <span className="text-xs uppercase tracking-wider text-gray-500">{u.role}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <a className="text-[#D4AF37] hover:text-[#b5922e]" href={`mailto:${u.email}`}>{u.email}</a>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 border-gray-300 px-2 text-xs text-gray-700 hover:bg-gray-100" onClick={() => onEditTenantUser(u.id, u.role)}>Edit</Button>
                          <Button variant="outline" size="sm" className="h-7 border-[#D4AF37]/40 px-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => onDeleteTenantUser(u.id)}>Delete</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── System Analytics ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <Icon className="h-3.5 w-3.5 text-[#D4AF37]" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[#121212]">{value}</div>
    </div>
  );
}

// ── System Logs (native audit/error-tracking system) ──────────────────────────

interface SystemLogEntry {
  id: number;
  logType: string;
  platform: string;
  userId: number | null;
  tenantId: number | null;
  message: string;
  stackTrace: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface SystemLogSummaryRow {
  logType: string;
  platform: string;
  count: number;
  lastSeen: string;
}

function logTypeBadge(logType: string) {
  if (logType === "ONBOARDING_FAIL" || logType === "CLIENT_EXCEPTION" || logType === "SERVER_EXCEPTION") {
    return <Badge className="bg-red-600 text-white text-[10px] font-semibold">{logType}</Badge>;
  }
  if (logType === "ONBOARDING_SUCCESS" || logType === "FIRST_LOGIN") {
    return <Badge className="bg-green-600 text-white text-[10px] font-semibold">{logType}</Badge>;
  }
  return <Badge className="bg-zinc-600 text-white text-[10px] font-semibold">{logType}</Badge>;
}

const renderSafeLogTimestamp = (dateString: string) => {
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? "N/A" : format(d, "MMM d, yyyy h:mm a");
  } catch {
    return "N/A";
  }
};

function SystemLogsTab() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: summary = [], isLoading: summaryLoading } = useQuery<SystemLogSummaryRow[]>({
    queryKey: ["system-logs-summary"],
    queryFn: () => customFetch("/api/system-logs/summary"),
  });

  const { data: logs = [], isLoading: logsLoading, error } = useQuery<SystemLogEntry[], Error>({
    queryKey: ["system-logs"],
    queryFn: () => customFetch("/api/system-logs"),
  });

  const totalErrors7d = summary.reduce((sum, s) => sum + s.count, 0);
  const onboardingFailures = summary.filter((s) => s.logType === "ONBOARDING_FAIL").reduce((sum, s) => sum + s.count, 0);
  const clientExceptions = summary.filter((s) => s.logType === "CLIENT_EXCEPTION").reduce((sum, s) => sum + s.count, 0);

  const filtered = search.trim()
    ? logs.filter((l) => {
        const q = search.toLowerCase();
        return (
          l.logType.toLowerCase().includes(q) ||
          l.platform.toLowerCase().includes(q) ||
          l.message.toLowerCase().includes(q)
        );
      })
    : logs;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">System Logs</h2>
        <p className="mt-1 text-sm text-gray-500">Onboarding events and client-side runtime errors, across web and mobile.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Events (7d)" value={summaryLoading ? "…" : totalErrors7d} icon={BarChart3} />
        <StatCard label="Onboarding Failures (7d)" value={summaryLoading ? "…" : onboardingFailures} icon={AlertTriangle} />
        <StatCard label="Client Exceptions (7d)" value={summaryLoading ? "…" : clientExceptions} icon={Bug} />
        <StatCard label="Total Logged" value={logsLoading ? "…" : logs.length} icon={DatabaseZap} />
      </div>

      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-[#121212]">By Type &amp; Platform (last 7 days)</CardTitle>
          <CardDescription className="text-gray-500">Grouped counts, most recently seen first.</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">Loading…</div>
          ) : summary.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">No events in the last 7 days.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {summary.map((s) => (
                <div key={`${s.logType}-${s.platform}`} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {logTypeBadge(s.logType)}
                  <span className="text-gray-500">{s.platform}</span>
                  <span className="font-bold text-[#121212]">×{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base font-bold text-[#121212]">Recent Events</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by type, platform, or message..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">Loading…</div>
          )}
          {error && (
            <div className="text-sm text-red-600">Failed to load system logs: {error.message}</div>
          )}
          {!logsLoading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left font-medium text-gray-500 py-2.5 pr-4 w-44">Timestamp</th>
                    <th className="text-left font-medium text-gray-500 py-2.5 pr-4 w-40">Type</th>
                    <th className="text-left font-medium text-gray-500 py-2.5 pr-4 w-24">Platform</th>
                    <th className="text-left font-medium text-gray-500 py-2.5 pr-4">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">No system logs found.</td>
                    </tr>
                  )}
                  {filtered.map((log) => (
                    <Fragment key={log.id}>
                      <tr
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        <td className="py-3 pr-4 text-xs text-gray-500 whitespace-nowrap">{renderSafeLogTimestamp(log.createdAt)}</td>
                        <td className="py-3 pr-4">{logTypeBadge(log.logType)}</td>
                        <td className="py-3 pr-4 text-xs text-gray-500">{log.platform}</td>
                        <td className="py-3 pr-4 text-sm text-[#121212] truncate max-w-md">{log.message}</td>
                      </tr>
                      {expandedId === log.id && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="space-y-1.5 text-xs text-gray-600">
                              <div><span className="font-semibold">User ID:</span> {log.userId ?? "—"} &nbsp; <span className="font-semibold">Tenant ID:</span> {log.tenantId ?? "—"}</div>
                              {log.stackTrace && (
                                <pre className="whitespace-pre-wrap rounded-md bg-white border border-gray-200 p-2 font-mono text-[11px] text-gray-700">{log.stackTrace}</pre>
                              )}
                              {log.metadata && (
                                <pre className="whitespace-pre-wrap rounded-md bg-white border border-gray-200 p-2 font-mono text-[11px] text-gray-700">{JSON.stringify(log.metadata, null, 2)}</pre>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type SystemAnalyticsTabProps = {
  tenants: TenantRow[];
  plans: Plan[];
  features: Feature[];
  onOpenPlan: () => void;
  onOpenFeature: () => void;
  onEditPlan: (plan: Plan) => void;
  onEditFeature: (feature: Feature) => void;
  onDeleteFeature: (feature: Feature) => void;
  onToggleFeaturePlan: (featureId: number, planId: number, checked: boolean) => void;
  collapsed: { plans: boolean; features: boolean };
  setCollapsed: (value: { plans: boolean; features: boolean }) => void;
};

function SystemAnalyticsTab({
  tenants,
  plans,
  features,
  onOpenPlan,
  onOpenFeature,
  onEditPlan,
  onEditFeature,
  onDeleteFeature,
  onToggleFeaturePlan,
  collapsed,
  setCollapsed,
}: SystemAnalyticsTabProps) {
  const totalTenants = tenants.length;
  const totalUsers = tenants.reduce((sum, t) => sum + (t.userCount ?? 0), 0);
  const activeSubs = tenants.filter((t) => t.subscription?.status === "active").length;
  const mrr = tenants.reduce((sum, t) => {
    if (t.subscription?.status !== "active" || !t.plan) return sum;
    const fullPlan = plans.find((p) => p.id === t.plan!.id);
    if (!fullPlan) return sum;
    const monthly = t.subscription.billingCycle === "yearly" ? Number(fullPlan.yearlyPrice) / 12 : Number(fullPlan.monthlyPrice);
    return sum + (Number.isFinite(monthly) ? monthly : 0);
  }, 0);
  const planCounts = plans.map((p) => ({ plan: p, count: tenants.filter((t) => t.plan?.id === p.id).length }));
  const maxCount = Math.max(1, ...planCounts.map((pc) => pc.count));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">System Analytics</h2>
        <p className="mt-1 text-sm text-gray-500">Live snapshot of tenants, revenue, plans, and features.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Tenants" value={totalTenants} icon={Building2} />
        <StatCard label="Total Users" value={totalUsers} icon={Users} />
        <StatCard label="Active Subscriptions" value={activeSubs} icon={CheckCircle2} />
        <StatCard label="Est. Monthly Revenue" value={`$${mrr.toFixed(0)} CAD`} icon={DollarSign} />
      </div>

      <Card className="border-gray-200 bg-white text-[#121212]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-[#121212]">Plan Distribution</CardTitle>
          <CardDescription className="text-gray-500">Tenants per plan tier</CardDescription>
        </CardHeader>
        <CardContent>
          {planCounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">No plans configured yet.</div>
          ) : (
            <div className="space-y-3">
              {planCounts.map(({ plan, count }) => (
                <div key={plan.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-[#121212]">{planIcon(plan.slug)}{plan.name}</span>
                    <span className="text-gray-500">{count} tenant{count === 1 ? "" : "s"}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-[#D4AF37]" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-gray-200 bg-white text-[#121212]">
          <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, plans: !collapsed.plans })}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-extrabold tracking-tight text-[#D4AF37]">Plan Administration</CardTitle>
                <CardDescription className="font-semibold text-gray-500">Create and manage plan tiers.</CardDescription>
              </div>
              <ChevronDown className={`h-5 w-5 text-[#D4AF37] transition-transform ${collapsed.plans ? "" : "rotate-180"}`} />
            </div>
          </CardHeader>
          {!collapsed.plans && (
            <CardContent>
              {plans.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">No plans yet.</div>
              ) : (
                <div className="space-y-2">
                  {plans.map((p) => (
                    <button key={p.id} onClick={() => onEditPlan(p)} className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left hover:bg-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-semibold text-[#121212]">{planIcon(p.slug)}{p.name}</span>
                        <Badge className={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{p.isActive ? "Enabled" : "Disabled"}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{p.slug} · {formatCAD(Math.round(Number(p.monthlyPrice) * 100))}/mo · {p.maxSeats} seats · {p.featureIds.length} features</div>
                    </button>
                  ))}
                </div>
              )}
              <Button className="mt-3 bg-[#D4AF37] font-bold text-white hover:bg-[#b5922e]" onClick={onOpenPlan}>New Plan</Button>
            </CardContent>
          )}
        </Card>

        <Card className="border-gray-200 bg-white text-[#121212]">
          <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed({ ...collapsed, features: !collapsed.features })}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-extrabold tracking-tight text-[#D4AF37]">Feature Administration</CardTitle>
                <CardDescription className="font-semibold text-gray-500">Create feature flags and assign them to plans.</CardDescription>
              </div>
              <ChevronDown className={`h-5 w-5 text-[#D4AF37] transition-transform ${collapsed.features ? "" : "rotate-180"}`} />
            </div>
          </CardHeader>
          {!collapsed.features && (
            <CardContent>
              {features.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">No features yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 pr-4 text-left font-semibold text-[#121212]">Feature</th>
                        {plans.map((p) => (<th key={p.id} className="px-2 py-2 text-center text-xs font-semibold text-gray-600">{p.name}</th>))}
                        <th className="px-2 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {features.map((f) => (
                        <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <button onClick={() => onEditFeature(f)} className="text-left"><span className="font-semibold text-[#121212]">{f.name}</span></button>
                              <Badge className={f.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{f.isEnabled ? "Enabled" : "Disabled"}</Badge>
                            </div>
                            <div className="text-xs text-gray-500">{f.key}</div>
                          </td>
                          {plans.map((p) => {
                            const checked = p.featureIds.includes(f.id);
                            return (
                              <td key={`${f.id}-${p.id}`} className="px-2 py-2 text-center">
                                <label className="inline-flex cursor-pointer items-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => onToggleFeaturePlan(f.id, p.id, e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                                  />
                                </label>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => onEditFeature(f)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#D4AF37]"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => onDeleteFeature(f)} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Button className="mt-3 bg-[#D4AF37] font-bold text-white hover:bg-[#b5922e]" onClick={onOpenFeature}>New Feature</Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Shared dialogs ────────────────────────────────────────────────────────────

function PlanDialog({ open, form, onChange, onSave, onCancel, onDelete, isSaving, isDeleting }: PlanDialogState) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#121212]">Plan Administration</h3>
            <p className="text-sm font-semibold text-gray-500">Create, edit, activate, or delete plan tiers.</p>
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

function FeatureDialog({ open, form, onChange, onSave, onCancel, onDelete, isSaving, isDeleting }: FeatureDialogState) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
        <h3 className="text-lg font-semibold text-[#121212]">Feature Administration</h3>
        <p className="text-sm font-semibold text-gray-500">Create enabled/disabled features and assign them to plans.</p>
        <div className="mt-4 grid gap-4">
          <div><Label className="text-[#D4AF37]">Name</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Key</Label><Input className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.key} onChange={(e) => onChange({ ...form, key: e.target.value })} /></div>
          <div><Label className="text-[#D4AF37]">Description</Label><Textarea className="border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-[#D4AF37]" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {onDelete && <Button variant="outline" className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={onDelete} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete"}</Button>}
          <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={onCancel}>Cancel</Button>
          <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
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
        <p className="text-sm font-semibold text-gray-500">Update tenant profile, subscription, billing cycle, and plan.</p>
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

type ExportDeleteTenantDialogProps = {
  tenant: TenantDetail | null;
  onOpenChange: (open: boolean) => void;
  receiptId: number | null;
  onExport: () => void;
  isExporting: boolean;
  onDelete: (receiptId: number) => void;
  isDeleting: boolean;
};

function ExportDeleteTenantDialog({ tenant, onOpenChange, receiptId, onExport, isExporting, onDelete, isDeleting }: ExportDeleteTenantDialogProps) {
  const [confirmName, setConfirmName] = useState("");
  if (!tenant) return null;
  const nameMatches = confirmName.trim() === tenant.name;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 pointer-events-auto">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl pointer-events-auto">
        <h3 className="text-lg font-semibold text-[#121212]">Export &amp; Delete Tenant</h3>
        <p className="mt-1 text-sm font-semibold text-gray-500">
          Deleting "{tenant.name}" permanently removes all of its data. Export a copy first — deletion is blocked until you do.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-gray-200 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/10 text-sm font-bold text-[#D4AF37]">1</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#121212]">Export tenant data</p>
            <p className="text-xs text-gray-500">Downloads a ZIP with this tenant's memberships, projects, TradeHub posts, documents, and financial records.</p>
          </div>
          <Button
            variant="outline"
            className="border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10"
            onClick={onExport}
            disabled={isExporting || receiptId !== null}
          >
            {receiptId !== null ? "Exported ✓" : isExporting ? "Exporting…" : "Export"}
          </Button>
        </div>

        <div className={`mt-3 flex items-start gap-3 rounded-xl border p-4 ${receiptId === null ? "border-gray-100 opacity-50" : "border-red-200"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">2</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#121212]">Permanently delete</p>
            <p className="mt-1 text-xs text-gray-500">Type <span className="font-mono font-semibold">{tenant.name}</span> to confirm.</p>
            <Input
              className="mt-2 border-gray-300 bg-white text-[#121212] placeholder:text-gray-400 focus:border-red-400"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              disabled={receiptId === null}
              placeholder={tenant.name}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => receiptId !== null && onDelete(receiptId)}
            disabled={receiptId === null || !nameMatches || isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete Tenant"}
          </Button>
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
        <p className="text-sm font-semibold text-gray-500">Update first name, last name, email, and company role.</p>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("tenants");
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
  const [collapsed, setCollapsed] = useState({ plans: true, features: true });
  const [reissueOpen, setReissueOpen] = useState(false);
  const [reissuedLink, setReissuedLink] = useState<string | null>(null);
  const [exportDeleteTenant, setExportDeleteTenant] = useState<TenantDetail | null>(null);
  const [exportReceiptId, setExportReceiptId] = useState<number | null>(null);

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
      return editingPlanId ? customFetch<Plan>(`/api/admin/plans/${editingPlanId}`, { method: "PATCH", body: JSON.stringify(payload) }) : customFetch<Plan>("/api/admin/plans", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (res) => {
      if (res?.id && planFeatureIds.length > 0) await customFetch(`/api/admin/plans/${res.id}/features`, { method: "PUT", body: JSON.stringify({ featureIds: planFeatureIds }) });
      setPlanOpen(false); setEditingPlanId(null); setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5, isActive: true }); setPlanFeatureIds([]); refresh(); toast({ title: "Plan saved" });
    },
    onError: (e: ApiError) => toast({ title: "Plan save failed", description: e.message, variant: "destructive" }),
  });

  const deletePlan = useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/plans/${id}`, { method: "DELETE" }), onSuccess: () => { setPlanOpen(false); setEditingPlanId(null); setPlanForm({ name: "", slug: "", description: "", monthlyPrice: "", yearlyPrice: "", maxSeats: 5, isActive: true }); setPlanFeatureIds([]); refresh(); toast({ title: "Plan deleted" }); }, onError: (e: ApiError) => toast({ title: "Plan delete failed", description: e.message, variant: "destructive" }) });
  const saveFeature = useMutation({ mutationFn: () => { const payload = { ...featureForm, description: featureForm.description || null }; return editingFeatureId ? customFetch(`/api/admin/features/${editingFeatureId}`, { method: "PATCH", body: JSON.stringify(payload) }) : customFetch("/api/admin/features", { method: "POST", body: JSON.stringify(payload) }); }, onSuccess: () => { setFeatureOpen(false); setEditingFeatureId(null); setFeatureForm({ name: "", key: "", description: "", isEnabled: true }); refresh(); toast({ title: "Feature saved" }); }, onError: (e: ApiError) => toast({ title: "Feature save failed", description: e.message, variant: "destructive" }) });
  const deleteFeature = useMutation({ mutationFn: (id: number) => customFetch(`/api/admin/features/${id}`, { method: "DELETE" }), onSuccess: () => { refresh(); toast({ title: "Feature deleted" }); }, onError: (e: ApiError) => toast({ title: "Feature delete failed", description: e.message, variant: "destructive" }) });
  const assignPlanFeatures = useMutation({
    mutationFn: ({ planId, featureIds }: { planId: number; featureIds: number[] }) =>
      customFetch(`/api/admin/plans/${planId}/features`, { method: "POST", body: JSON.stringify({ featureIds }) }),
    onSuccess: () => { refresh(); toast({ title: "Feature assignments updated" }); },
    onError: (e: ApiError) => toast({ title: "Assignment failed", description: e.message, variant: "destructive" }),
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
    onSuccess: () => { setTenantOpen(false); setEditingTenantId(null); refresh(); toast({ title: "Tenant updated" }); },
    onError: (e: ApiError) => toast({ title: "Tenant update failed", description: e.message, variant: "destructive" }),
  });
  const saveTenantUserRole = useMutation({
    mutationFn: ({ userId, role, companyId }: { userId: number; role: string; companyId: number }) => customFetch(`/api/admin/users/${userId}/company-role`, {
      method: "PATCH",
      body: JSON.stringify({ role, companyId }),
    }),
    onSuccess: () => { refresh(); toast({ title: "User role updated" }); },
    onError: (e: ApiError) => toast({ title: "Role update failed", description: e.message, variant: "destructive" }),
  });
  const deleteTenantUser = useMutation({
    mutationFn: ({ userId, companyId }: { userId: number; companyId: number }) => customFetch(`/api/admin/tenants/${companyId}/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); toast({ title: "User removed from tenant" }); },
    onError: (e: ApiError) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });
  const deleteTenant = useMutation({
    mutationFn: ({ id, receiptId }: { id: number; receiptId: number }) => customFetch(`/api/admin/tenants/${id}?receiptId=${receiptId}`, { method: "DELETE" }),
    onSuccess: () => { setTenantOpen(false); setEditingTenantId(null); setTenantDetailId(null); setExportDeleteTenant(null); setExportReceiptId(null); refresh(); toast({ title: "Tenant deleted" }); },
    onError: (e: ApiError) => toast({ title: "Tenant delete failed", description: e.message, variant: "destructive" }),
  });
  const exportTenant = useMutation({
    mutationFn: (tenant: TenantDetail) => exportTenantData(tenant.id, tenant.name),
    onSuccess: (result) => { setExportReceiptId(result.receiptId); toast({ title: "Export downloaded", description: "Verify the file, then confirm deletion." }); },
    onError: (e: Error) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });
  const reissueLink = useMutation({
    mutationFn: (id: number) => customFetch<{ link: string }>(`/api/admin/tenants/${id}/reissue-link`, { method: "POST" }),
    onSuccess: (data) => { setReissuedLink(data.link); setReissueOpen(true); refresh(); toast({ title: "Link reissued" }); },
    onError: (e: ApiError) => toast({ title: "Reissue failed", description: e.message, variant: "destructive" }),
  });
  const saveMember = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: { firstName: string; lastName: string; email: string } }) =>
      customFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { refresh(); setMemberOpen(false); setEditingMemberId(null); toast({ title: "Member updated" }); },
    onError: (e: ApiError) => toast({ title: "Member update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#121212]"><ShieldCheck className="h-6 w-6 text-[#D4AF37]" /> Super Admin</h1>
        <p className="mt-1 text-sm font-semibold text-gray-500">Manage tenants, invites, and system-wide configuration.</p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="border border-gray-200 bg-white">
          <TabsTrigger value="tenants" className="gap-1.5 font-semibold text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white"><Building2 className="h-3.5 w-3.5" />Tenant Directory</TabsTrigger>
          <TabsTrigger value="invite" className="gap-1.5 font-semibold text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white"><Gift className="h-3.5 w-3.5" />Invite Generator</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 font-semibold text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white"><BarChart3 className="h-3.5 w-3.5" />System Analytics</TabsTrigger>
          <TabsTrigger value="system-logs" className="gap-1.5 font-semibold text-gray-600 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-white"><Bug className="h-3.5 w-3.5" />System Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="tenants">
          <TenantDirectoryTab
            tenants={tenants}
            plans={plans}
            features={features}
            tenantDetail={tenantDetail}
            tenantDetailId={tenantDetailId}
            onSelectTenant={setTenantDetailId}
            onEditTenant={(t) => {
              setEditingTenantId(t.id);
              setSelectedTenantUserId("");
              setSelectedTenantUserRole("worker");
              setTenantForm({ name: t.name, planId: t.plan?.id ? String(t.plan.id) : "", status: t.subscription?.status ?? "active", billingCycle: t.subscription?.billingCycle ?? "monthly", userCount: String(t.userCount ?? ""), website: "", phone: "", email: "" });
              setTenantOpen(true);
            }}
            onDeleteTenant={(t) => { setExportReceiptId(null); setExportDeleteTenant(t); }}
            onReissueLink={(t) => reissueLink.mutate(t.id)}
            isReissuing={reissueLink.isPending}
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
            onGoToInvite={() => setActiveTab("invite")}
          />
        </TabsContent>
        <TabsContent value="invite"><InviteGeneratorTab /></TabsContent>
        <TabsContent value="analytics">
          <SystemAnalyticsTab
            tenants={tenants}
            plans={plans}
            features={features}
            onOpenPlan={() => setPlanOpen(true)}
            onOpenFeature={() => setFeatureOpen(true)}
            onEditPlan={(p) => { setEditingPlanId(p.id); setPlanForm({ name: p.name, slug: p.slug, description: p.description ?? "", monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, maxSeats: p.maxSeats, isActive: p.isActive }); setPlanFeatureIds(p.featureIds); setPlanOpen(true); }}
            onEditFeature={(f) => { setEditingFeatureId(f.id); setFeatureForm({ name: f.name, key: f.key, description: f.description ?? "", isEnabled: f.isEnabled }); setFeatureOpen(true); }}
            onDeleteFeature={(f) => deleteFeature.mutate(f.id)}
            onToggleFeaturePlan={(featureId, planId, checked) => {
              const plan = plans.find((p) => p.id === planId);
              if (!plan) return;
              const nextIds = checked ? [...new Set([...plan.featureIds, featureId])] : plan.featureIds.filter((id) => id !== featureId);
              assignPlanFeatures.mutate({ planId, featureIds: nextIds });
            }}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        </TabsContent>
        <TabsContent value="system-logs"><SystemLogsTab /></TabsContent>
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
        onDelete={editingFeatureId ? () => deleteFeature.mutate(editingFeatureId) : undefined}
        isSaving={saveFeature.isPending}
        isDeleting={deleteFeature.isPending}
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
          setSelectedTenantUserRole(tenantDetail?.users.find((user) => String(user.id) === id)?.role ?? "worker");
        }}
        onSelectedUserRoleChange={(role) => setSelectedTenantUserRole(role)}
        onSave={() => {
          saveTenant.mutate();
          if (selectedTenantUserId && editingTenantId != null) {
            saveTenantUserRole.mutate({ userId: Number(selectedTenantUserId), role: selectedTenantUserRole, companyId: editingTenantId });
          }
        }}
        isSaving={saveTenant.isPending || saveTenantUserRole.isPending}
        users={tenantDetail?.users}
      />
      <ExportDeleteTenantDialog
        tenant={exportDeleteTenant}
        onOpenChange={(open) => { if (!open) { setExportDeleteTenant(null); setExportReceiptId(null); } }}
        receiptId={exportReceiptId}
        onExport={() => exportDeleteTenant && exportTenant.mutate(exportDeleteTenant)}
        isExporting={exportTenant.isPending}
        onDelete={(receiptId) => exportDeleteTenant && deleteTenant.mutate({ id: exportDeleteTenant.id, receiptId })}
        isDeleting={deleteTenant.isPending}
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
      {reissueOpen && reissuedLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-[#121212] shadow-2xl">
            <h3 className="text-lg font-semibold text-[#121212]">Reissued Sign-up Link</h3>
            <p className="text-sm font-semibold text-gray-500">Copy the link below and share it with the company owner.</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-green-600">Shareable Link</div>
                <div className="break-all text-sm text-[#121212]">{reissuedLink}</div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => { navigator.clipboard.writeText(reissuedLink); toast({ title: "Link copied to clipboard" }); }}><Copy className="mr-2 h-4 w-4" />Copy Link</Button>
                <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100" onClick={() => setReissueOpen(false)}>Close</Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10" onClick={() => { const subject = encodeURIComponent("Your Site Snap company sign-up link"); const body = encodeURIComponent(`Hi,\n\nHere is your updated sign-up link for Site Snap:\n\n${reissuedLink}\n\nThanks.`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }}>Send via Email</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
