import { useMemo } from "react";
import { useListCostCatalog } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import type { LineItem } from "@/lib/estimator";

/** Lets the contractor append a priced line item straight from the company's
 *  cost catalog, without waiting on the AI/rule-based estimator to surface it. */
export function AddFromCatalogButton({
  onAdd,
}: {
  onAdd: (item: LineItem) => void;
}) {
  const { data } = useListCostCatalog();
  const items = data?.items ?? [];

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [items]);

  if (items.length === 0) return null;

  function handlePick(idStr: string) {
    const item = items.find(i => String(i.id) === idStr);
    if (!item) return;
    onAdd({
      id: crypto.randomUUID(),
      description: item.itemName,
      category: item.unitType === "hour" ? "labour" : "materials",
      quantity: 1,
      unit: item.unitType,
      unitCost: parseFloat(item.unitPrice),
      total: parseFloat(item.unitPrice),
      editable: true,
    });
  }

  return (
    <Select onValueChange={handlePick}>
      <SelectTrigger className="h-7 w-auto gap-1.5 text-xs border-dashed">
        <BookOpen className="h-3 w-3" />
        <SelectValue placeholder="Add from Price Book" />
      </SelectTrigger>
      <SelectContent>
        {[...byCategory.entries()].map(([category, catItems]) => (
          <SelectGroup key={category}>
            <SelectLabel className="text-[10px]">{category}</SelectLabel>
            {catItems.map(item => (
              <SelectItem key={item.id} value={String(item.id)} className="text-sm">
                {item.itemName} — ${parseFloat(item.unitPrice).toFixed(2)}/{item.unitType}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
