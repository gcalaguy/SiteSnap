import { useState } from "react";
import { ChevronDown, ChevronRight, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PricingSettingsBody } from "@/pages/pricing-manager";

export function PricingTab() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full text-left"
      >
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Pricing Manager
            </CardTitle>
            <CardDescription>
              Customize the $/sqft rates, overhead, and contingency used by the Smart Estimator.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent>
          <PricingSettingsBody />
        </CardContent>
      )}
    </Card>
  );
}
