import { useState, useCallback, useEffect, useMemo, memo } from "react";
import { useListProjects, type Project, type UserWithCompany } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Wrench, Package, CheckCircle2, RotateCcw, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  GOLD, GOLD_BUTTON, ASSET_TYPE_ICONS,
  debounce, getInitials, Pill, SearchBox, StatTile, EmptyBlock, SkeletonCard,
  AddAssetModal, type InventoryAsset, type CheckoutRow,
} from "@/components/inventory/shared";
import { useAssetsByCategory } from "@/hooks/inventory/useInventoryAssets";
import { useToolCheckouts, useReturnTool, useCheckoutTool } from "@/hooks/inventory/useToolCheckouts";
import { useActiveCompanyMembers } from "@/hooks/inventory/useCompanyMembers";

// Off-screen cards skip layout/paint until scrolled into view; the reserved
// height keeps the grid's scrollbar stable while that content is unmounted.
const CARD_CONTAINMENT_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "0 190px" };

interface ToolCardProps {
  tool: InventoryAsset;
  checkout: CheckoutRow | undefined;
  onCheckout: (tool: InventoryAsset) => void;
  onReturn: (checkoutId: number, assetName: string) => void;
}

const ToolCard = memo(function ToolCard({ tool, checkout, onCheckout, onReturn }: ToolCardProps) {
  const isOut = !!checkout;
  const holderName = checkout
    ? checkout.userFirstName
      ? `${checkout.userFirstName} ${checkout.userLastName ?? ""}`.trim()
      : checkout.checkedOutToName ?? checkout.contactName ?? "Unknown"
    : null;
  const holderInitials = checkout ? getInitials(checkout.userFirstName, checkout.userLastName) : null;
  const AssetIcon = ASSET_TYPE_ICONS[tool.assetType] ?? Package;

  return (
    <div
      className="rounded-2xl bg-white p-4 flex flex-col items-center text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] group relative"
      style={{ border: `1px solid ${isOut ? "#fde68a" : "#E5E5E5"}`, ...CARD_CONTAINMENT_STYLE }}
    >
      {/* Tool Icon or Photo */}
      <div
        className="h-14 w-14 rounded-xl flex items-center justify-center mb-3"
        style={{
          background: isOut ? "#fffbeb" : `${GOLD}12`,
          border: `1px solid ${isOut ? "#fde68a" : `${GOLD}25`}`,
        }}
      >
        {tool.photoUrl ? (
          <img src={tool.photoUrl} alt={tool.name} className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <AssetIcon size={22} style={{ color: isOut ? "#d97706" : GOLD }} />
        )}
      </div>

      <p className="text-xs font-bold truncate w-full mb-0.5" style={{ color: "#111111" }}>{tool.name}</p>
      <p className="text-[10px] capitalize mb-3" style={{ color: "#888888" }}>{tool.assetType}</p>

      {/* Status */}
      {isOut ? (
        <div className="flex flex-col items-center gap-1 w-full">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "#d97706" }}
          >
            {holderInitials}
          </div>
          <p className="text-[10px] font-semibold truncate max-w-full" style={{ color: "#111111" }}>{holderName}</p>
          {checkout?.projectName && (
            <p className="text-[9px] truncate max-w-full" style={{ color: "#888888" }}>{checkout.projectName}</p>
          )}
          <button
            className="mt-1 text-[10px] font-semibold rounded-full px-2 py-0.5 transition-colors"
            style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}
            onClick={() => onReturn(checkout!.id, tool.name)}
          >
            <RotateCcw size={9} className="inline mr-0.5" />
            Return
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 w-full">
          <Pill label="In Yard" color="#16a34a" bg="#f0fdf4" border="#bbf7d0" icon={CheckCircle2} />
          <button
            className="mt-1 text-[10px] font-semibold rounded-full px-3 py-1 transition-colors"
            style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}44` }}
            onClick={() => onCheckout(tool)}
          >
            Check Out
          </button>
        </div>
      )}
    </div>
  );
});

export function ToolsTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [checkoutModal, setCheckoutModal] = useState<InventoryAsset | null>(null);
  const [addToolModal, setAddToolModal] = useState(false);
  const [returnId, setReturnId] = useState<{ checkoutId: number; assetName: string } | null>(null);

  const debounceFn = useCallback(debounce((v: string) => setDebouncedSearch(v), 300), []);
  useEffect(() => debounceFn(search), [search, debounceFn]);

  const { data: toolsData, isLoading: loadingTools } = useAssetsByCategory("small_tool", debouncedSearch);
  const { data: checkoutsData, isLoading: loadingCheckouts } = useToolCheckouts();
  const { members: membersData } = useActiveCompanyMembers();
  const { data: projectsData } = useListProjects();

  const returnTool = useReturnTool(() => setReturnId(null));

  const tools = toolsData?.data ?? [];
  const checkouts = checkoutsData ?? [];

  // Map assetId → checkout record for quick lookup
  const checkoutsByAsset = useMemo(() => {
    const map = new Map<number, CheckoutRow>();
    for (const c of checkouts) map.set(c.assetId, c);
    return map;
  }, [checkouts]);

  const inYard = tools.filter((t) => !checkoutsByAsset.has(t.id)).length;
  const checkedOut = tools.filter((t) => checkoutsByAsset.has(t.id)).length;

  const isLoading = loadingTools || loadingCheckouts;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="In Yard" value={inYard} icon={CheckCircle2} color="#16a34a" loading={isLoading} />
        <StatTile label="Checked Out" value={checkedOut} icon={ArrowRightLeft} color="#d97706" loading={isLoading} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <SearchBox className="flex-1" value={search} onChange={setSearch} placeholder="Search tools…" />
        <Button size="sm" className={GOLD_BUTTON} onClick={() => setAddToolModal(true)}>
          <Plus size={14} className="mr-1" /> Add Tool
        </Button>
      </div>

      {/* Tool Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : tools.length === 0 ? (
        <EmptyBlock icon={Wrench} title="No small tools added yet" sub="Track lasers, saws, generators and other high-theft items" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              checkout={checkoutsByAsset.get(tool.id)}
              onCheckout={setCheckoutModal}
              onReturn={(checkoutId, assetName) => setReturnId({ checkoutId, assetName })}
            />
          ))}
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutModal && (
        <CheckoutToolModal
          tool={checkoutModal}
          members={membersData}
          projects={projectsData ?? []}
          onClose={() => setCheckoutModal(null)}
          onSaved={() => setCheckoutModal(null)}
        />
      )}

      {/* Add Tool Modal */}
      <AddAssetModal
        open={addToolModal}
        category="small_tool"
        onClose={() => setAddToolModal(false)}
        onSaved={() => setAddToolModal(false)}
      />

      {/* Return Confirm */}
      <AlertDialog open={returnId !== null} onOpenChange={() => setReturnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return {returnId?.assetName}?</AlertDialogTitle>
            <AlertDialogDescription>Mark this tool as returned to the yard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={GOLD_BUTTON}
              onClick={() => returnId && returnTool.mutate(returnId.checkoutId)}
            >
              {returnTool.isPending ? <Loader2 size={14} className="animate-spin" /> : "Confirm Return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CheckoutToolModal({
  tool, members, projects, onClose, onSaved,
}: {
  tool: InventoryAsset; members: UserWithCompany[]; projects: Project[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    userId: "",
    freeformName: "",
    projectId: "",
    expectedReturnDate: "",
    notes: "",
  });

  const { toast } = useToast();
  const checkoutTool = useCheckoutTool(tool.name, onSaved);

  function handleSave() {
    if (!form.userId && !form.freeformName.trim()) {
      toast({ title: "Please select or enter who is checking this out", variant: "destructive" });
      return;
    }
    checkoutTool.mutate({
      assetId: tool.id,
      notes: form.notes || undefined,
      projectId: form.projectId ? parseInt(form.projectId) : undefined,
      expectedReturnDate: form.expectedReturnDate || undefined,
      ...(form.userId
        ? { checkedOutToUserId: parseInt(form.userId) }
        : { checkedOutToName: form.freeformName.trim() }),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check Out Tool</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg px-3 py-2" style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
            <p className="text-sm font-semibold" style={{ color: GOLD }}>{tool.name}</p>
            <p className="text-xs capitalize" style={{ color: "#888888" }}>{tool.assetType}</p>
          </div>
          <div>
            <Label className="text-xs">Assign to Team Member</Label>
            <Select value={form.userId} onValueChange={(v) => setForm((f) => ({ ...f, userId: v, freeformName: "" }))}>
              <SelectTrigger><SelectValue placeholder="Select crew member…" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.firstName} {m.lastName} — {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Or enter name (for subs / visitors)</Label>
            <Input
              value={form.freeformName}
              onChange={(e) => setForm((f) => ({ ...f, freeformName: e.target.value, userId: "" }))}
              placeholder="e.g. John Smith (sub)"
            />
          </div>
          <div>
            <Label className="text-xs">Project</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Expected Return Date</Label>
            <Input type="date" value={form.expectedReturnDate} onChange={(e) => setForm((f) => ({ ...f, expectedReturnDate: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className={GOLD_BUTTON} onClick={handleSave} disabled={checkoutTool.isPending}>
            {checkoutTool.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Check Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
