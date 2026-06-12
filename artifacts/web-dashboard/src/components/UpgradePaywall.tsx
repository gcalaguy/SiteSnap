import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradePaywallProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

/**
 * "Upgrade to Unlock" state shown in place of a feature that is not included
 * in the workspace's current plan. Pair with <FeatureGuard fallback={...}>.
 */
export function UpgradePaywall({ title, description, icon: Icon = Sparkles }: UpgradePaywallProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center px-4">
      <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
        <Icon className="h-7 w-7 text-amber-700" />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-lg">Upgrade to Unlock {title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      </div>
      <Button
        size="sm"
        className="bg-amber-600 hover:bg-amber-700 text-white"
        onClick={() => window.open("mailto:support@sitesnap.ca?subject=Upgrade%20plan", "_blank")}
      >
        <Sparkles className="h-4 w-4 mr-1.5" />
        Upgrade Plan
      </Button>
    </div>
  );
}
