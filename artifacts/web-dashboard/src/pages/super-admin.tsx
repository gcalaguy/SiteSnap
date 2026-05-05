import { useState } from "react";
import { useGetMe, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ShieldCheck, Plus, Pencil, Trash2, Loader2, Check,
  Building2, Users, Zap, ToggleLeft, ToggleRight, Crown,
  RefreshCw, DatabaseZap,
} from "lucide-react";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ───────────────────────────────────────────────────────────────────────

interface Plan {
  id: number; name: string; slug: string; description: string | null;
  monthlyPrice: string; yearlyPrice: string; maxSeats: number;
  isActive: boolean; featureIds: number[];
}

interface Feature {
  id: number; name: string; key: string; description: string | null; isEnabled: boolean;
}

interface Tenant {
  id: number; name: string; city: string; province: string;
  userCount: number;
  subscription: {
    id: number; planId: number; status: string; billingCycle: string;
  } | null;
  plan: Plan | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return customFetch<T>(path, init);
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trial: "bg-blue-100 text-blue-800",
  past_due: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  inactive: "bg-gray-100 text-gray-800",
};

// ── Plans Tab ───────────────────────────────────────────────────────────────────

function PlansTab({ plans, features, isLoading }: { plans: Plan[]; features: Feature[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", monthlyPrice: "0", yearlyPrice: "0", maxSeats: "5" });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", slug: "", description: "", monthlyPrice: "0", yearlyPrice: "0", maxSeats: "5" });
    setOpen(true);
  }
  function openEdit(p: Plan) {
    setEditing(p);
    setForm({ name: p.name, slug: p.slug, description: p.description ?? "", monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, maxSeats: String(p.maxSeats) });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: () => api<Plan>(editing ? `/api/admin/plans/${editing.id}` : "/api/admin/plans", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, maxSeats: Number(form.maxSeats) }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-plans"] }); setOpen(false); toast({ title: "Plan saved" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/admin/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-plans"] }); toast({ title: "Plan deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading plans…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{plans.length} pricing tier{plans.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New Plan</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Monthly</TableHead>
              <TableHead>Yearly</TableHead>
              <TableHead>Max Seats</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="outline">{p.slug}</Badge></TableCell>
                <TableCell>${p.monthlyPrice}/mo</TableCell>
                <TableCell>${p.yearlyPrice}/yr</TableCell>
                <TableCell>{p.maxSeats}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.featureIds.map((fid) => {
                      const f = features.find((x) => x.id === fid);
                      return f ? <Badge key={fid} className="text-[10px]">{f.name}</Badge> : null;
                    })}
                    {p.featureIds.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={p.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMut.mutate(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {plans.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No plans yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Plan" : "Create Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(["name", "slug", "description"] as const).map((f) => (
              <div key={f} className="grid gap-1.5">
                <Label className="capitalize">{f}</Label>
                <Input value={form[f]} onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))} />
              </div>
            ))}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5"><Label>Monthly ($)</Label><Input type="number" value={form.monthlyPrice} onChange={(e) => setForm((p) => ({ ...p, monthlyPrice: e.target.value }))} /></div>
              <div className="grid gap-1.5"><Label>Yearly ($)</Label><Input type="number" value={form.yearlyPrice} onChange={(e) => setForm((p) => ({ ...p, yearlyPrice: e.target.value }))} /></div>
              <div className="grid gap-1.5"><Label>Max Seats</Label><Input type="number" value={form.maxSeats} onChange={(e) => setForm((p) => ({ ...p, maxSeats: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Features Tab ────────────────────────────────────────────────────────────────

function FeaturesTab({ features, isLoading }: { features: Feature[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Feature | null>(null);
  const [form, setForm] = useState({ name: "", key: "", description: "" });

  function openCreate() { setEditing(null); setForm({ name: "", key: "", description: "" }); setOpen(true); }
  function openEdit(f: Feature) { setEditing(f); setForm({ name: f.name, key: f.key, description: f.description ?? "" }); setOpen(true); }

  const saveMut = useMutation({
    mutationFn: () => api<Feature>(editing ? `/api/admin/features/${editing.id}` : "/api/admin/features", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-features"] }); setOpen(false); toast({ title: "Feature saved" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: (f: Feature) => api<Feature>(`/api/admin/features/${f.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !f.isEnabled }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-features"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/admin/features/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-features"] }); toast({ title: "Feature deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading features…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{features.length} feature{features.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New Feature</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Global Toggle</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {features.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{f.key}</code></TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.description ?? "—"}</TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleMut.mutate(f)}
                    className="flex items-center gap-1.5 text-sm"
                    title={f.isEnabled ? "Disable globally" : "Enable globally"}
                  >
                    {f.isEnabled
                      ? <ToggleRight className="h-5 w-5 text-green-600" />
                      : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                    <span className={f.isEnabled ? "text-green-700 font-medium" : "text-muted-foreground"}>
                      {f.isEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMut.mutate(f.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {features.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No features yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Feature" : "Create Feature"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(["name", "key", "description"] as const).map((field) => (
              <div key={field} className="grid gap-1.5">
                <Label className="capitalize">{field === "key" ? "Feature Key (e.g. AI_ESTIMATING)" : field}</Label>
                <Input value={form[field]} onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Plan → Features Assignment Tab ─────────────────────────────────────────────

function PlanFeaturesTab({ plans, features, isLoadingPlans, isLoadingFeatures }: {
  plans: Plan[]; features: Feature[]; isLoadingPlans: boolean; isLoadingFeatures: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function selectPlan(id: number) {
    const p = plans.find((x) => x.id === id);
    setSelectedPlanId(id);
    setChecked(new Set(p?.featureIds ?? []));
  }

  const saveMut = useMutation({
    mutationFn: () => api(`/api/admin/plans/${selectedPlanId}/features`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureIds: Array.from(checked) }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "Features updated", description: `${selectedPlan?.name} now has ${checked.size} feature(s)` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoadingPlans || isLoadingFeatures) return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5 max-w-xs">
        <Label>Select Plan</Label>
        <Select onValueChange={(v) => selectPlan(Number(v))}>
          <SelectTrigger><SelectValue placeholder="Choose a plan…" /></SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedPlan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {selectedPlan.name} — Feature Access
            </CardTitle>
            <CardDescription>Check the features this plan includes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {features.map((f) => (
              <div key={f.id} className={`flex items-start gap-3 p-3 rounded-lg border ${!f.isEnabled ? "opacity-50" : ""}`}>
                <Checkbox
                  id={`feature-${f.id}`}
                  checked={checked.has(f.id)}
                  onCheckedChange={(v) => setChecked((prev) => {
                    const s = new Set(prev);
                    v ? s.add(f.id) : s.delete(f.id);
                    return s;
                  })}
                  disabled={!f.isEnabled}
                />
                <div className="flex-1">
                  <label htmlFor={`feature-${f.id}`} className="text-sm font-medium cursor-pointer">{f.name}</label>
                  <p className="text-xs text-muted-foreground">{f.description ?? f.key}</p>
                  {!f.isEnabled && <Badge variant="outline" className="text-[10px] mt-1">Globally disabled</Badge>}
                </div>
              </div>
            ))}
            {features.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No features defined yet</p>}
          </CardContent>
          <div className="px-6 pb-6">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="w-full">
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save Feature Assignment
            </Button>
          </div>
        </Card>
      )}

      {!selectedPlan && plans.length > 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a plan above to manage its features</p>
        </div>
      )}
    </div>
  );
}

// ── Tenants Tab ─────────────────────────────────────────────────────────────────

function TenantsTab({ plans, isLoading }: { plans: Plan[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [subForm, setSubForm] = useState({ planId: "", status: "active", billingCycle: "monthly" });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["admin-tenants"],
    queryFn: () => api<Tenant[]>("/api/admin/tenants"),
  });

  function openEdit(t: Tenant) {
    setEditing(t);
    setSubForm({
      planId: String(t.subscription?.planId ?? ""),
      status: t.subscription?.status ?? "active",
      billingCycle: t.subscription?.billingCycle ?? "monthly",
    });
  }

  const saveMut = useMutation({
    mutationFn: () => api(`/api/admin/tenants/${editing!.id}/subscription`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: Number(subForm.planId), status: subForm.status, billingCycle: subForm.billingCycle }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tenants"] }); setEditing(null); toast({ title: "Subscription updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const loading = isLoading || tenantsLoading;
  if (loading) return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{tenants.length} tenant{tenants.length !== 1 ? "s" : ""} registered</p>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.city}, {t.province}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{t.userCount}</span>
                    {t.plan && <span className="text-xs text-muted-foreground">/ {t.plan.maxSeats}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  {t.plan
                    ? <Badge className="bg-primary/10 text-primary">{t.plan.name}</Badge>
                    : <span className="text-xs text-muted-foreground">No plan</span>}
                </TableCell>
                <TableCell>
                  {t.subscription
                    ? <Badge className={statusColors[t.subscription.status] ?? "bg-gray-100 text-gray-700"}>{t.subscription.status}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground capitalize">
                  {t.subscription?.billingCycle ?? "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tenants.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No tenants registered yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Subscription — {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Plan</Label>
              <Select value={subForm.planId} onValueChange={(v) => setSubForm((p) => ({ ...p, planId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select plan…" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} — ${p.monthlyPrice}/mo</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={subForm.status} onValueChange={(v) => setSubForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["active", "trial", "past_due", "cancelled", "inactive"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Billing Cycle</Label>
              <Select value={subForm.billingCycle} onValueChange={(v) => setSubForm((p) => ({ ...p, billingCycle: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !subForm.planId}>
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const isSuperAdmin = (user as any)?.systemRole === "super_admin";

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["admin-plans"],
    queryFn: () => api<Plan[]>("/api/admin/plans"),
    enabled: isSuperAdmin,
  });

  const { data: features = [], isLoading: featuresLoading } = useQuery<Feature[]>({
    queryKey: ["admin-features"],
    queryFn: () => api<Feature[]>("/api/admin/features"),
    enabled: isSuperAdmin,
  });

  const seedMut = useMutation({
    mutationFn: () => api("/api/admin/seed", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-features"] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast({ title: "Seed data applied", description: "Starter, Pro & Enterprise plans created with features" });
    },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Super Admin Access Required</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          This area is restricted to platform super admins only. Contact SiteSnap support if you believe you should have access.
        </p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
            <p className="text-sm text-muted-foreground">Global platform management — plans, features, and tenants</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { qc.invalidateQueries({ queryKey: ["admin-plans"] }); qc.invalidateQueries({ queryKey: ["admin-features"] }); qc.invalidateQueries({ queryKey: ["admin-tenants"] }); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
          >
            {seedMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DatabaseZap className="h-4 w-4 mr-2" />}
            Seed Data
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Plans",           value: plans.length,                                   icon: Crown },
          { label: "Features",        value: features.length,                                icon: Zap   },
          { label: "Active Features", value: features.filter((f) => f.isEnabled).length,    icon: Check },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
              <Icon size={15} style={{ color: GOLD }} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="plans">
        <TabsList className="grid w-full grid-cols-4" style={{ background: BLACK }}>
          {[
            { value: "plans",         label: "Plans",         Icon: Crown       },
            { value: "features",      label: "Features",      Icon: Zap         },
            { value: "plan-features", label: "Plan Features", Icon: DatabaseZap },
            { value: "tenants",       label: "Tenants",       Icon: Building2   },
          ].map(({ value, label, Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-2 text-neutral-400 data-[state=active]:bg-[#C9A84C] data-[state=active]:text-[#111111] data-[state=active]:shadow-none"
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="plans" className="mt-4">
          <PlansTab plans={plans} features={features} isLoading={plansLoading} />
        </TabsContent>
        <TabsContent value="features" className="mt-4">
          <FeaturesTab features={features} isLoading={featuresLoading} />
        </TabsContent>
        <TabsContent value="plan-features" className="mt-4">
          <PlanFeaturesTab plans={plans} features={features} isLoadingPlans={plansLoading} isLoadingFeatures={featuresLoading} />
        </TabsContent>
        <TabsContent value="tenants" className="mt-4">
          <TenantsTab plans={plans} isLoading={plansLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
