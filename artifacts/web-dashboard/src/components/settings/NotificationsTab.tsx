import { useState } from "react";
import { Mail, CheckCircle, AlertCircle, Loader2, ExternalLink, Info, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDigest } from "@/hooks/settings/useDigest";

export function NotificationsTab() {
  const [collapsed, setCollapsed] = useState(true);
  const { status, detail, sandboxInfo, handleSend } = useDigest();

  return (
    <Card>
      <button onClick={() => setCollapsed(c => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Daily Digest Email
            </CardTitle>
            <CardDescription>
              A morning summary is automatically emailed to all owners and foremens every day at 7:00 AM ET,
              showing yesterday's reports, open RFIs, and overdue tasks across all active projects.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
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

          {status === "sandbox" && sandboxInfo && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-800">Resend sandbox mode — domain not verified</p>
                  <p className="text-sm text-amber-700">
                    Your Resend account is in test mode and can only send to{" "}
                    <span className="font-mono font-medium">{sandboxInfo.allowedEmail}</span>.
                    To send real emails to your team, verify a custom domain.
                  </p>
                </div>
              </div>

              {sandboxInfo.intendedRecipients.length > 0 && (
                <div className="pl-6 text-sm text-amber-700">
                  <p className="font-medium mb-1">Would have sent to:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-600">
                    {sandboxInfo.intendedRecipients.map((r) => (
                      <li key={r} className="font-mono text-xs">{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pl-6">
                <a
                  href="https://resend.com/domains"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                  Verify a domain at resend.com/domains
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
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
      )}
    </Card>
  );
}
