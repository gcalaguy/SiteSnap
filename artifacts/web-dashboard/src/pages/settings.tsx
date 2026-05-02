import { useGetMe, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";

function DigestCard() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [detail, setDetail] = useState("");

  const handleSend = async () => {
    setStatus("sending");
    setDetail("");
    try {
      const res = await customFetch("/api/digest/send-now", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Error ${res.status}`);
      }
      const data = await res.json() as { sent: number; recipients: string[] };
      setDetail(`Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}: ${data.recipients.join(", ")}`);
      setStatus("sent");
    } catch (err: any) {
      setDetail(err.message ?? "Failed to send digest");
      setStatus("error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Daily Digest Email
        </CardTitle>
        <CardDescription>
          A morning summary is automatically emailed to all owners and foremans every day at 7:00 AM ET,
          showing yesterday's reports, open RFIs, and overdue tasks across all active projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">What's included in each digest:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Daily reports submitted yesterday (per project)</li>
            <li>All open and in-review RFIs with overdue indicators</li>
            <li>Overdue tasks across all active projects</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={handleSend}
            disabled={status === "sending" || status === "sent"}
            className="w-fit"
          >
            {status === "sending" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
            ) : status === "sent" ? (
              <><CheckCircle className="h-4 w-4 mr-2" />Digest Sent!</>
            ) : (
              <><Mail className="h-4 w-4 mr-2" />Send Digest Now</>
            )}
          </Button>

          {status === "sent" && detail && (
            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{detail}</span>
            </div>
          )}
          {status === "error" && detail && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{detail}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: user } = useGetMe();
  const company = user?.company;

  if (!company) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your company information and preferences.</p>
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

      <DigestCard />
    </div>
  );
}
