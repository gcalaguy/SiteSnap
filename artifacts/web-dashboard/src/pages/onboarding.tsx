import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUser } from "@clerk/react";
import { useCreateCompany, useAcceptInvitation, useSyncUser, useGetMe, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, KeyRound, Loader2 } from "lucide-react";

const companySchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),
  province: z.string().min(2, "Province is required"),
  city: z.string().min(2, "City is required"),
  phone: z.string().optional(),
});

const INVITE_TOKEN_KEY = "sitesnap_pending_invite_token";
const PENDING_COMPANY_KEY = "sitesnap_pending_company";
const PENDING_CLAIM_KEY = "sitesnap_pending_claim";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user: clerkUser } = useUser();
  const searchParams = new URLSearchParams(window.location.search);
  const urlToken = searchParams.get("token");
  const urlCompanyId = searchParams.get("companyId");
  const refCode = searchParams.get("ref") ?? undefined;

  const resolvedToken = urlToken || sessionStorage.getItem(INVITE_TOKEN_KEY) || "";
  const resolvedClaimCompanyId = urlCompanyId || sessionStorage.getItem(PENDING_CLAIM_KEY) || "";

  const { data: dbUser } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!clerkUser },
  });
  const isWorker = dbUser?.role === "worker";

  const [activeTab, setActiveTab] = useState(resolvedToken || isWorker ? "join" : "create");

  // Force workers to the join tab
  useEffect(() => {
    if (isWorker) setActiveTab("join");
  }, [isWorker]);

  // Early redirect: unauthenticated user with companyId → sign-up then auto-claim
  useEffect(() => {
    if (clerkUser || !resolvedClaimCompanyId) return;
    toast({
      title: "Create your account first",
      description: "Sign up below — you'll be automatically assigned as the company owner.",
    });
    setLocation("/sign-up");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser, resolvedClaimCompanyId]);

  const createCompany = useCreateCompany();
  const acceptInvitation = useAcceptInvitation();
  const syncUser = useSyncUser();

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      province: "",
      city: "",
      phone: "",
    },
  });

  const [inviteToken, setInviteToken] = useState(resolvedToken);

  if (urlToken) sessionStorage.setItem(INVITE_TOKEN_KEY, urlToken);
  if (urlCompanyId) sessionStorage.setItem(PENDING_CLAIM_KEY, urlCompanyId);

  // Auto-resume pending company claim after sign-up redirect
  const autoClaimed = useRef(false);
  useEffect(() => {
    if (!clerkUser || autoClaimed.current) return;
    const claimId = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (!claimId) return;
    autoClaimed.current = true;
    sessionStorage.removeItem(PENDING_CLAIM_KEY);
    // Sync user first (ensures DB user record exists), then claim
    syncUser.mutate(
      {
        data: {
          clerkUserId: clerkUser.id,
          email: clerkUser.primaryEmailAddress?.emailAddress || "",
          firstName: clerkUser.firstName || "",
          lastName: clerkUser.lastName || "",
        },
      },
      {
        onSuccess: () => doClaimCompany(claimId),
        onError: () => doClaimCompany(claimId),
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser]);

  // Auto-resume pending company creation after sign-up redirect (legacy self-serve flow)
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!clerkUser || autoSubmitted.current || autoClaimed.current) return;
    const raw = sessionStorage.getItem(PENDING_COMPANY_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as z.infer<typeof companySchema>;
      form.reset(saved);
      setActiveTab("create");
      autoSubmitted.current = true;
      sessionStorage.removeItem(PENDING_COMPANY_KEY);
      setTimeout(() => {
        form.handleSubmit(doCreate)();
      }, 300);
    } catch {
      sessionStorage.removeItem(PENDING_COMPANY_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser]);

  function doClaimCompany(companyId: string) {
    customFetch(`/api/companies/${companyId}/claim`, { method: "POST" })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Company claimed successfully" });
        setLocation("/dashboard");
      })
      .catch((err: any) => {
        toast({
          title: "Failed to claim company",
          description: err?.message || "Company may already be claimed or invalid.",
          variant: "destructive",
        });
      });
  }

  function doCreate(values: z.infer<typeof companySchema>) {
    createCompany.mutate(
      { data: { ...values, ...(refCode ? { referredByCode: refCode } : {}) } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          sessionStorage.removeItem(INVITE_TOKEN_KEY);
          sessionStorage.removeItem(PENDING_COMPANY_KEY);
          toast({ title: "Company created successfully" });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          toast({
            title: "Failed to create company",
            description: err?.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  }

  function onSubmitCreate(values: z.infer<typeof companySchema>) {
    if (!clerkUser) {
      sessionStorage.setItem(PENDING_COMPANY_KEY, JSON.stringify(values));
      toast({
        title: "Create your account first",
        description: "Sign up below — we'll bring you right back to finish setting up your company.",
      });
      setLocation("/sign-up");
      return;
    }
    doCreate(values);
  }

  function doAccept() {
    acceptInvitation.mutate(
      { token: inviteToken.trim() },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          sessionStorage.removeItem(INVITE_TOKEN_KEY);
          toast({ title: "Joined company successfully" });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          toast({
            title: "Failed to join company",
            description: err?.message || "Invalid or expired token",
            variant: "destructive",
          });
        },
      }
    );
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    if (!clerkUser) {
      if (inviteToken.trim()) sessionStorage.setItem(INVITE_TOKEN_KEY, inviteToken.trim());
      toast({
        title: "Sign in first",
        description: "Sign in or create an account, then you'll be automatically brought back to join your company.",
      });
      setLocation("/sign-in");
      return;
    }

    syncUser.mutate(
      {
        data: {
          clerkUserId: clerkUser.id,
          email: clerkUser.primaryEmailAddress?.emailAddress || "",
          firstName: clerkUser.firstName || "",
          lastName: clerkUser.lastName || "",
        },
      },
      {
        onSuccess: () => doAccept(),
        onError: () => doAccept(),
      }
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Site Snap</h1>
          <p className="mt-2 text-muted-foreground">
            {isWorker
              ? "Enter the invite token your owner or foreman sent you to join your team."
              : "Let's get your workspace set up."}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {!isWorker && (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create Company</TabsTrigger>
              <TabsTrigger value="join">Join Existing</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="create" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Create your company</CardTitle>
                <CardDescription>You will be set as the owner.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Construction Ltd." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="Toronto" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="province"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Province</FormLabel>
                            <FormControl>
                              <Input placeholder="ON" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="555-123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createCompany.isPending}>
                      {createCompany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {clerkUser ? "Create Company" : "Continue to Sign Up"}
                    </Button>
                    {!clerkUser && (
                      <p className="text-center text-xs text-muted-foreground">
                        You'll create your account on the next step, then your company will be set up automatically.
                      </p>
                    )}
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="join" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Join a company</CardTitle>
                <CardDescription>Enter the invite token provided by your foreman or owner.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onJoin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="token">Invitation Token</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="token"
                        placeholder="Paste token here..."
                        className="pl-9"
                        value={inviteToken}
                        onChange={(e) => setInviteToken(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={syncUser.isPending || acceptInvitation.isPending || !inviteToken}>
                    {(syncUser.isPending || acceptInvitation.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Join Company
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
