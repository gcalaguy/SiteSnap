import { cn } from "@/lib/utils";
import { type LineItem, fmtCurrency as fmt } from "@/lib/estimator";

const CATEGORY_COLORS: Record<string, string> = {
  labour:    "text-blue-600",
  materials: "text-green-600",
  addon:     "text-purple-600",
  overhead:  "text-amber-600",
};

export function LineItemsTable({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  const updateItem = (id: string, field: keyof LineItem, value: number) => {
    const clamped = Math.max(0, value);
    onChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: clamped };
        if (field === "quantity" || field === "unitCost") {
          updated.total = Math.round(updated.quantity * updated.unitCost);
        } else if (field === "total") {
          updated.total = clamped;
        }
        return updated;
      }),
    );
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Qty</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Unit</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Unit Cost</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-muted/20 group">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", CATEGORY_COLORS[item.category])}>
                    {item.category}
                  </span>
                  <span className="text-sm font-medium">{item.description}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                {item.editable ? (
                  <input
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                    className="w-20 text-right bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary outline-none text-sm py-0.5 transition-colors"
                  />
                ) : (
                  <span className="text-muted-foreground">{item.quantity.toLocaleString()}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground">{item.unit}</td>
              <td className="px-3 py-2 text-right">
                {item.editable ? (
                  <input
                    type="number"
                    min="0"
                    value={item.unitCost}
                    onChange={(e) => updateItem(item.id, "unitCost", parseFloat(e.target.value) || 0)}
                    className="w-24 text-right bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary outline-none text-sm py-0.5 transition-colors"
                  />
                ) : (
                  <span className="text-muted-foreground">{fmt(item.unitCost)}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {item.editable ? (
                  <input
                    type="number"
                    min="0"
                    value={item.total}
                    onChange={(e) => updateItem(item.id, "total", parseFloat(e.target.value) || 0)}
                    className="w-24 text-right bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary outline-none font-semibold text-sm py-0.5 transition-colors"
                  />
                ) : (
                  <span className="font-semibold">{fmt(item.total)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 border-t border-border">
          <tr>
            <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">
              Line Items Total
            </td>
            <td className="px-3 py-2 text-right font-bold">
              {fmt(items.reduce((s, i) => s + i.total, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
