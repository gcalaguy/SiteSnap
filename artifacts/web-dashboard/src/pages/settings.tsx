import { useGetMe } from "@workspace/api-client-react";
import { Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyTab } from "@/components/settings/CompanyTab";
import { FeaturesTab } from "@/components/settings/FeaturesTab";
import { PermissionsTab } from "@/components/settings/PermissionsTab";
import { BrandingTab } from "@/components/settings/BrandingTab";
import { PricingTab } from "@/components/settings/PricingTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { AccountingTab } from "@/components/settings/AccountingTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";

export default function Settings() {
  const { data: user } = useGetMe();
  const company = user?.company;
  const isOwner = user?.role === "owner";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <Globe className="h-6 w-6" style={{ color: "#D4AF37" }} />
          Settings
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">Manage your company information and preferences.</p>
      </div>

      <Tabs defaultValue="company" className="space-y-5">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="company">Company</TabsTrigger>
          {isOwner && company && <TabsTrigger value="features">Features</TabsTrigger>}
          {isOwner && company && <TabsTrigger value="permissions">Permissions</TabsTrigger>}
          {company && <TabsTrigger value="branding">Branding & Documents</TabsTrigger>}
          {isOwner && <TabsTrigger value="pricing">Pricing</TabsTrigger>}
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanyTab user={user} company={company} />
        </TabsContent>

        {isOwner && company && (
          <TabsContent value="features">
            <FeaturesTab companyId={company.id} />
          </TabsContent>
        )}

        {isOwner && company && (
          <TabsContent value="permissions">
            <PermissionsTab companyId={company.id} ownerId={user.id} />
          </TabsContent>
        )}

        {company && (
          <TabsContent value="branding">
            <BrandingTab company={company} isOwner={!!isOwner} />
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="pricing">
            <PricingTab />
          </TabsContent>
        )}

        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="accounting">
          <AccountingTab />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
