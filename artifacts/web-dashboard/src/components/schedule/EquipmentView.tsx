import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit2, Loader2, Trash2, Wrench } from "lucide-react";
import { useEquipmentQuery, useEquipmentMutations } from "@/hooks/schedule/useEquipment";
import { BLACK, GOLD, type Equipment } from "@/components/schedule/shared";

const STATUS_COLOR: Record<string, string> = {
  available: "bg-green-100 text-green-700 border-green-200",
  in_use: "bg-amber-100 text-amber-700 border-amber-200",
  maintenance: "bg-red-100 text-red-700 border-red-200",
  retired: "bg-gray-100 text-gray-500 border-gray-200",
};

// Rows off-screen skip layout/paint/style work entirely (content-visibility)
// until they scroll into view; contain-intrinsic-size reserves their height
// up front so the scrollbar doesn't jump as rows mount/unmount their content.
const ROW_CONTAINMENT_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "0 52px" };

interface EquipmentRowProps {
  eq: Equipment;
  isOwnerOrForeman: boolean;
  onEdit: (eq: Equipment) => void;
  onDelete: (id: number) => void;
}

const EquipmentRow = memo(function EquipmentRow({ eq, isOwnerOrForeman, onEdit, onDelete }: EquipmentRowProps) {
  const sc = STATUS_COLOR[eq.status] ?? STATUS_COLOR.available;
  return (
    <div className="flex items-center gap-4 px-4 py-3" style={ROW_CONTAINMENT_STYLE}>
      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: BLACK }}>
        <Wrench className="h-4 w-4" style={{ color: GOLD }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{eq.name}</p>
        <p className="text-xs text-muted-foreground capitalize">{eq.type.replace(/_/g, " ")}</p>
      </div>
      <Badge variant="outline" className={`text-xs shrink-0 ${sc}`}>
        {eq.status.replace(/_/g, " ")}
      </Badge>
      {isOwnerOrForeman && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(eq)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(eq.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

interface EquipmentViewProps {
  isOwnerOrForeman: boolean;
  onEditEquipment: (eq: Equipment) => void;
}

export function EquipmentView({ isOwnerOrForeman, onEditEquipment }: EquipmentViewProps) {
  const equipmentQuery = useEquipmentQuery(true);
  const { deleteEquipMut } = useEquipmentMutations();

  return (
    <div>
      {equipmentQuery.isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading equipment…
        </div>
      ) : !equipmentQuery.data || equipmentQuery.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Wrench className="h-10 w-10 mb-3 opacity-40" />
            <p className="font-medium">No equipment added yet.</p>
            <p className="text-sm mt-1">Add equipment to track availability and bookings.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {equipmentQuery.data.map(eq => (
              <EquipmentRow
                key={eq.id}
                eq={eq}
                isOwnerOrForeman={isOwnerOrForeman}
                onEdit={onEditEquipment}
                onDelete={deleteEquipMut.mutate}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
