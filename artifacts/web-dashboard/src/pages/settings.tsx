import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function Settings() {
  const { data: user } = useGetMe();
  const company = user?.company;

  if (!company) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your company information.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>This information is visible on all reports and documents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={company.name} readOnly disabled />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={company.city} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Province</Label>
              <Input value={company.province} readOnly disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={company.phone || ""} readOnly disabled />
          </div>
          <p className="text-sm text-muted-foreground pt-4">
            * Company details can only be edited by contacting support currently.
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={user.firstName} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={user.lastName} readOnly disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input value={user.role} readOnly disabled className="capitalize" />
          </div>
          <p className="text-sm text-muted-foreground pt-4">
            * Profile details are synced from your login provider.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
