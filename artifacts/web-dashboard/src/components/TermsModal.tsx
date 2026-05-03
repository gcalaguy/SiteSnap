import { useState } from "react";
import { useAcceptTerms, getGetMeQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Loader2, FileText } from "lucide-react";

const TERMS_CONTENT = `
TERMS AND CONDITIONS OF USE

Effective Date: May 3, 2026
Company Name: SiteSnap Inc.


1. ACCEPTANCE OF TERMS

By accessing or using the Site Snap platform ("Service"), you agree to be bound by these Terms and Conditions. If you do not agree, you must not use the Service.


2. DESCRIPTION OF SERVICE

Site Snap provides a cloud-based construction project management platform that includes features such as scheduling, estimating, task management, client communication, and AI-powered insights.

We reserve the right to modify or discontinue any feature at any time without notice.


3. USER RESPONSIBILITIES

You agree to:
• Provide accurate and complete information
• Use the Service only for lawful business purposes
• Not misuse, reverse engineer, or disrupt the platform
• Maintain confidentiality of your login credentials

You are solely responsible for:
• All project data entered into the system
• Compliance with construction laws, regulations, and safety requirements


4. AI & AUTOMATION DISCLAIMER

The Service may provide AI-generated recommendations, estimates, schedules, or insights.

You acknowledge that:
• AI outputs are for informational purposes only
• They may not be accurate, complete, or suitable for your specific project
• You are solely responsible for reviewing and validating all outputs before relying on them

We are not liable for decisions made based on AI-generated content.


5. PAYMENTS & SUBSCRIPTIONS

• The Service is billed on a subscription basis (monthly or annually)
• Fees are non-refundable unless otherwise stated
• We may change pricing with reasonable notice
• Failure to pay may result in suspension or termination of access


6. DATA & PRIVACY

Your use of the Service is also governed by our Privacy Policy.

You retain ownership of your data. However, you grant us a limited license to use, store, and process your data to provide and improve the Service.


7. SERVICE AVAILABILITY

We strive to maintain uptime but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance or technical issues.


8. LIMITATION OF LIABILITY

To the maximum extent permitted by law:

• We are not liable for:
  – Loss of profits, revenue, or business opportunities
  – Project delays or construction defects
  – Errors in estimates, schedules, or data

• Our total liability shall not exceed the amount paid by you in the past 3 months.


9. INDEMNIFICATION

You agree to indemnify and hold harmless SiteSnap Inc. from any claims, damages, or liabilities arising from:
• Your use of the Service
• Your construction projects
• Violations of these Terms


10. TERMINATION

We may suspend or terminate your account at any time if you violate these Terms.

You may cancel your subscription at any time. No refunds will be issued for unused time unless required by law.


11. GOVERNING LAW

These Terms shall be governed by the laws of the Province of Ontario and the laws of Canada applicable therein.


12. CHANGES TO TERMS

We reserve the right to update these Terms at any time. Continued use of the Service constitutes acceptance of the updated Terms.


13. CONTACT INFORMATION

For questions regarding these Terms, contact:
support@sitesnap.ca
`.trim();

export function TermsModal({ open }: { open: boolean }) {
  const [agreed, setAgreed] = useState(false);

  const acceptTerms = useAcceptTerms({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
    },
  });

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-2xl flex flex-col gap-4"
        style={{ maxHeight: "90vh" }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Terms and Conditions</DialogTitle>
              <DialogDescription>
                Please read the full terms below and accept to continue using Site Snap.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="rounded-md border bg-muted/30 flex-1" style={{ maxHeight: "50vh" }}>
          <pre className="p-4 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-sans">
            {TERMS_CONTENT}
          </pre>
        </ScrollArea>

        <div className="flex items-start gap-3 p-3 rounded-md border bg-background">
          <Checkbox
            id="terms-agree"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(!!v)}
            className="mt-0.5"
          />
          <Label htmlFor="terms-agree" className="cursor-pointer text-sm leading-snug">
            I have read and agree to the Site Snap Terms and Conditions
          </Label>
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            disabled={!agreed || acceptTerms.isPending}
            onClick={() => acceptTerms.mutate()}
          >
            {acceptTerms.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept and Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
