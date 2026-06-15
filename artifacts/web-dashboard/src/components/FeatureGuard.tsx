import { useGetMe, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useCompanyFeatures(companyId: number | null | undefined) {
  return useQuery({
    queryKey: ["company-features", companyId],
    queryFn: () =>
      customFetch<{ features: string[] }>(`${basePath}/api/companies/${companyId}/features`),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

interface FeatureGuardProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  silent?: boolean;
}

/**
 * Wraps children behind a feature flag check.
 *
 * - If the user's company has the feature enabled (via custom package or plan), renders children.
 * - Otherwise shows a "locked" placeholder or custom fallback.
 * - Super admins always pass through.
 * - When `silent` is true, renders nothing instead of the lock card.
 */
export function FeatureGuard({ feature, children, fallback, silent }: FeatureGuardProps) {
  const { data: me } = useGetMe();
  const companyId = me?.activeCompanyId as number | null | undefined;
  const { data, isLoading } = useCompanyFeatures(companyId);

  if (me?.systemRole === "super_admin") return <>{children}</>;
  // P1 fix: fail-closed during loading and on error — never render gated children
  // when we don't yet know if the feature is enabled.
  if (!me || isLoading) return null;
  // If the features query errored or returned nothing, treat as not enabled (fail-closed)
  const isEnabled = data?.features?.includes(feature) ?? false;

  if (!isEnabled) {
    if (fallback !== undefined) return <>{fallback}</>;
    if (silent) return null;
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5 text-center px-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-semibold text-lg">Feature Not Available</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This feature is not included in your current plan. Contact your administrator to enable it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.open("mailto:support@sitesnap.ca", "_blank")}>
          Contact Admin
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Redirects to /dashboard if the current user's resolved permissions don't include the given key.
 * Owners always pass through (permissions is undefined for them).
 * Renders nothing while the user is still loading.
 */
export function PermissionGuard({
  permissionKey,
  children,
}: {
  permissionKey: string;
  children: React.ReactNode;
}) {
  const { data: me, isLoading } = useGetMe();
  if (isLoading || !me) return null;
  const allowed =
    !me.permissions ||
    (me.permissions as Record<string, boolean>)[permissionKey] !== false;
  if (!allowed) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

/**
 * Toast-based guard for inline elements.
 * Renders children but intercepts clicks to show a toast if feature is locked.
 */
export function FeatureToastGuard({
  feature,
  children,
  message,
}: {
  feature: string;
  children: React.ReactNode;
  message?: string;
}) {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const companyId = me?.activeCompanyId as number | null | undefined;
  const { data } = useCompanyFeatures(companyId);

  if (me?.systemRole === "super_admin") return <>{children}</>;

  const isEnabled = data?.features?.includes(feature) ?? true;

  if (isEnabled) return <>{children}</>;

  return (
    <div
      onClick={() =>
        toast({
          title: "Feature not available",
          description: message ?? "Contact your administrator to enable this feature.",
          variant: "destructive",
        })
      }
      className="cursor-not-allowed opacity-60 pointer-events-auto"
    >
      {children}
    </div>
  );
}
