import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Users,
  CreditCard,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Subscription {
  status: string;
  current_period_end?: number;
  items?: { data: Array<{ price?: { product?: string } }> };
}

function AdminPage() {
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => customFetch<{ subscription: Subscription | null; company: any }>(`${basePath}/api/billing/subscription`),
  });

  const checkoutMutation = useMutation({
    mutationFn: ({ priceId }: { priceId: string }) =>
      customFetch<{ url: string }>(`${basePath}/api/billing/checkout`, {
        method: "POST",
        body: JSON.stringify({ priceId }),
      }),
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err: any) => { toast({ title: "Checkout failed", description: err.message, variant: "destructive" }); },
  });

  if (me?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Owner Access Required</h2>
        <p className="text-muted-foreground text-sm">Only company owners can access the Admin panel.</p>
      </div>
    );
  }

  const subscription: Subscription | null = subData?.subscription ?? null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Admin & Billing
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your subscription, team seats, and company settings.</p>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <CreditCard size={15} style={{ color: GOLD }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Current Subscription</span>
          </div>
        </div>
        <p className="text-xs mb-4" style={{ color: "#71717a" }}>Your company's active billing plan</p>
        {subLoading ? (
          <div className="h-10 rounded-md animate-pulse" style={{ background: "#1f1f1f" }} />
        ) : subscription ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <CreditCard className="h-6 w-6" style={{ color: GOLD }} />
              <div>
                <div className="font-semibold text-sm text-white">Site Snap Plan</div>
                <div className="text-xs mt-0.5" style={{ color: GOLD }}>
                  Renews {new Date((subscription.current_period_end ?? 0) * 1000).toLocaleDateString("en-CA", { dateStyle: "medium" })}
                </div>
              </div>
            </div>
            <Button size="sm" className="gap-2" style={{ background: GOLD, color: BLACK }} onClick={() => checkoutMutation.mutate({ priceId: "" })} disabled={checkoutMutation.isPending}>
              <ExternalLink className="h-3.5 w-3.5" />
              {checkoutMutation.isPending ? "Opening…" : "Manage Billing"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3" style={{ color: "#71717a" }}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">No active subscription. Contact your administrator to get started.</span>
          </div>
        )}
      </div>

      <div className="rounded-xl p-5" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Users size={15} style={{ color: GOLD }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Team Seats</span>
        </div>
        <p className="text-xs mb-4" style={{ color: "#71717a" }}>Active team members on your plan</p>
        <div className="flex items-center gap-3" style={{ color: "#71717a" }}>
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">Seat details are managed in Super Admin.</span>
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
