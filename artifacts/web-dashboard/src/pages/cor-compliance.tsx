import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { BadgeCheck, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GOLD, BLACK } from "@/components/cor-compliance/shared";
import { OverviewTab, GenerateAuditPackageDialog } from "@/components/cor-compliance/OverviewTab";
import { AuditTrailTab } from "@/components/cor-compliance/AuditTrailTab";
import { CredentialsTab } from "@/components/cor-compliance/CredentialsTab";
import { SignoffsTab } from "@/components/cor-compliance/SignoffsTab";
import { SubcontractorsTab } from "@/components/cor-compliance/SubcontractorsTab";
import { CapaTab } from "@/components/cor-compliance/CapaTab";
import { ShadowAuditorTab } from "@/components/cor-compliance/ShadowAuditorTab";
import { AuditorAccessTab } from "@/components/cor-compliance/AuditorAccessTab";

export default function CorCompliancePage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  // Wait for role to be known before rendering role-dependent UI
  if (meLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isAdmin = me.role === "owner" || me.role === "foreman";
  const isOwner = me.role === "owner";

  function handlePackageSuccess() {
    queryClient.invalidateQueries({ queryKey: ["cor-audit-packages"] });
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      <div className="px-6 py-5 border-b" style={{ borderColor: "#1a1a1a", background: BLACK }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg"
              style={{ width: 38, height: 38, background: `${GOLD}1a`, border: `1px solid ${GOLD}40` }}>
              <BadgeCheck className="h-5 w-5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">COR Compliance</h1>
              <p className="text-xs text-zinc-500">Ontario IHSA Certificate of Recognition</p>
            </div>
          </div>

          {isAdmin && (
            <Button
              onClick={() => setShowGenerateDialog(true)}
              style={{ background: GOLD, color: BLACK, fontWeight: 600, letterSpacing: "0.01em" }}
            >
              <Download className="h-4 w-4 mr-2" />
              Generate Audit Package
            </Button>
          )}
        </div>
      </div>

      {isAdmin && (
        <GenerateAuditPackageDialog
          open={showGenerateDialog}
          onClose={() => setShowGenerateDialog(false)}
          onSuccess={handlePackageSuccess}
        />
      )}

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {isAdmin && <TabsTrigger value="shadow-auditor">Shadow Auditor</TabsTrigger>}
            {isAdmin && <TabsTrigger value="audit-trail">Audit Trail</TabsTrigger>}
            <TabsTrigger value="credentials">{isAdmin ? "Training Matrix" : "My Credentials"}</TabsTrigger>
            <TabsTrigger value="sign-offs">{isAdmin ? "Sign-offs" : "Documents"}</TabsTrigger>
            {isAdmin && <TabsTrigger value="subcontractors">Subcontractors</TabsTrigger>}
            {isAdmin && <TabsTrigger value="capa">CAPA</TabsTrigger>}
            {isOwner && <TabsTrigger value="auditor-access">Auditor Access</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab isAdmin={isAdmin} userId={me.id} onGeneratePackage={() => setShowGenerateDialog(true)} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="shadow-auditor">
              <ShadowAuditorTab />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="audit-trail">
              <AuditTrailTab />
            </TabsContent>
          )}

          <TabsContent value="credentials">
            <CredentialsTab isAdmin={isAdmin} userId={me.id} />
          </TabsContent>

          <TabsContent value="sign-offs">
            <SignoffsTab isAdmin={isAdmin} userId={me.id} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="subcontractors">
              <SubcontractorsTab isAdmin={isAdmin} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="capa">
              <CapaTab />
            </TabsContent>
          )}

          {isOwner && (
            <TabsContent value="auditor-access">
              <AuditorAccessTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
