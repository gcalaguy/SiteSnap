import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUser } from "@clerk/react";
import { useCreateCompany, useAcceptInvitation, useSyncUser, useGetMe, getGetMeQueryKey, customFetch, type CreateCompanyBody } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, KeyRound, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const companySchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),
  province: z.string().min(2, "Province is required"),
  city: z.string().min(2, "City is required"),
  phone: z.string().optional(),
});

const claimSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  province: z.string().min(2, "Province is required"),
  city: z.string().min(2, "City is required"),
  phone: z.string().optional(),
  planTier: z.enum(["starter", "basic", "pro", "enterprise"]),
});

const INVITE_TOKEN_KEY = "sitesnap_pending_invite_token";
const PENDING_COMPANY_KEY = "sitesnap_pending_company";
const PENDING_CLAIM_KEY = "sitesnap_pending_claim";
const PENDING_CLAIM_DATA_KEY = "sitesnap_pending_claim_data";
// Persisted by SignUpPage when an admin-generated invite link (/sign-up?token=X) is followed
const SIGNUP_INVITE_KEY = "sitesnap_pending_signup_invite";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  // Capture query params once at mount — navigation clears window.location.search,
  // and re-reading it every render makes derived values flip mid-lifecycle.
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const urlToken = searchParams.get("token");
  const urlCompanyId = searchParams.get("companyId");
  const refCode = searchParams.get("ref") ?? undefined;
  // claimToken = the one-time token embedded in admin-generated /sign-up?token= links.
  // After Clerk OTP verification Clerk redirects to /onboarding?claimToken=X.
  // Also read from sessionStorage as a fallback (SignUpPage writes it there).
  const urlClaimToken = searchParams.get("claimToken");

  const resolvedToken = urlToken || sessionStorage.getItem(INVITE_TOKEN_KEY) || "";
  const resolvedClaimCompanyId = urlCompanyId || sessionStorage.getItem(PENDING_CLAIM_KEY) || "";
  const resolvedSignupInviteToken =
    urlClaimToken || sessionStorage.getItem(SIGNUP_INVITE_KEY) || "";

  const { data: dbUser } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!clerkUser },
  });
  const isWorker = dbUser?.role === "worker";

  // isSignupInviteMode: admin generated a /sign-up?token= link; takes priority over
  // the legacy ?companyId= claim mode so both don't render simultaneously.
  const isSignupInviteMode = !!resolvedSignupInviteToken;
  // isClaimMode: legacy path where companyId is in the URL (no token).
  const isClaimMode = !isSignupInviteMode && !!resolvedClaimCompanyId;
  const [activeTab, setActiveTab] = useState(resolvedToken || isWorker ? "join" : "create");

  // State for async token → companyId resolution
  const [signupInviteCompanyId, setSignupInviteCompanyId] = useState<string | null>(null);
  const [signupInviteLoading, setSignupInviteLoading] = useState(false);
  const [signupInviteError, setSignupInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (isWorker) setActiveTab("join");
  }, [isWorker]);

  const createCompany = useCreateCompany();
  const acceptInvitation = useAcceptInvitation();
  const syncUser = useSyncUser();

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", province: "", city: "", phone: "" },
  });

  const claimForm = useForm<z.infer<typeof claimSchema>>({
    resolver: zodResolver(claimSchema),
    defaultValues: { companyName: "", province: "", city: "", phone: "", planTier: "starter" },
  });

  const [inviteToken, setInviteToken] = useState(resolvedToken);

  // Persist URL params in an effect, not during render.
  useEffect(() => {
    if (urlToken) sessionStorage.setItem(INVITE_TOKEN_KEY, urlToken);
    if (urlCompanyId) sessionStorage.setItem(PENDING_CLAIM_KEY, urlCompanyId);
    if (urlClaimToken) sessionStorage.setItem(SIGNUP_INVITE_KEY, urlClaimToken);
  }, [urlToken, urlCompanyId, urlClaimToken]);

  // ── Signup Invite Flow (admin /sign-up?token= link) ───────────────────────
  // Resolve the claim token → companyId via public API so we never expose the
  // raw DB ID in the invite link.
  useEffect(() => {
    if (!resolvedSignupInviteToken || signupInviteCompanyId || signupInviteError) return;
    setSignupInviteLoading(true);
    customFetch<{ companyId: number }>(`/api/companies/claim-invite/${resolvedSignupInviteToken}`)
      .then((data) => {
        setSignupInviteCompanyId(String(data.companyId));
        setSignupInviteLoading(false);
      })
      .catch((err: Error) => {
        setSignupInviteError(err?.message || "Invalid or expired invite link.");
        setSignupInviteLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSignupInviteToken]);

  // Redirect unauthenticated users with a signup invite token to Clerk's sign-up.
  // The token is already in sessionStorage so SignUpPage can thread it through
  // Clerk's OTP flow into the fallbackRedirectUrl.
  const redirectedForSignupInvite = useRef(false);
  useEffect(() => {
    if (!clerkLoaded) return;
    if (clerkUser || !resolvedSignupInviteToken) return;
    if (redirectedForSignupInvite.current) return;
    redirectedForSignupInvite.current = true;
    toast({
      title: "Create your account first",
      description: "Sign up below — then you can claim your workspace.",
    });
    setLocation("/sign-up");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded, clerkUser, resolvedSignupInviteToken]);

  // Sync user to DB when they land here after Clerk sign-up (signup invite flow)
  const signupInviteSynced = useRef(false);
  useEffect(() => {
    if (!clerkUser || !resolvedSignupInviteToken || signupInviteSynced.current) return;
    if (dbUser) return; // already synced
    signupInviteSynced.current = true;
    syncUser.mutate({
      data: {
        clerkUserId: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        firstName: clerkUser.firstName || "",
        lastName: clerkUser.lastName || "",
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser, resolvedSignupInviteToken, dbUser]);

  function doSignupInviteClaim(values: z.infer<typeof claimSchema>) {
    if (!signupInviteCompanyId) return;
    customFetch(`/api/companies/${signupInviteCompanyId}/claim`, {
      method: "POST",
      body: JSON.stringify({ ...values, claimToken: resolvedSignupInviteToken }),
    })
      .then(() => {
        sessionStorage.removeItem(SIGNUP_INVITE_KEY);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Workspace created successfully" });
        setLocation("/dashboard");
      })
      .catch((err: Error) => {
        toast({
          title: "Failed to create workspace",
          description: err?.message || "Invalid or expired invite.",
          variant: "destructive",
        });
      });
  }

  function onSubmitSignupInviteClaim(values: z.infer<typeof claimSchema>) {
    if (!clerkUser) {
      toast({
        title: "Create your account first",
        description: "Sign up below — then you can claim your workspace.",
      });
      setLocation("/sign-up");
      return;
    }
    if (!dbUser) {
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
          onSuccess: () => doSignupInviteClaim(values),
          onError: () => doSignupInviteClaim(values),
        },
      );
      return;
    }
    doSignupInviteClaim(values);
  }

  // ── Claim Flow ────────────────────────────────────────────────────────────
  // If unauthenticated with a claim URL: redirect to sign-up, but persist the
  // claim data so they can enter company name/plan after signing up.
  //
  // Must wait for Clerk to resolve the session before deciding: `user` is
  // undefined while Clerk is still loading, so redirecting early sends
  // signed-in visitors to /sign-up, which bounces them straight back here
  // (fallbackRedirectUrl) — an infinite redirect loop. The ref makes the
  // redirect one-shot so a re-render can never re-trigger it.
  const redirectedToSignUp = useRef(false);
  useEffect(() => {
    if (!clerkLoaded) return;
    if (clerkUser || !resolvedClaimCompanyId) return;
    if (redirectedToSignUp.current) return;
    redirectedToSignUp.current = true;
    toast({
      title: "Create your account first",
      description: "Sign up below — then you can name your workspace and pick a plan.",
    });
    setLocation("/sign-up");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded, clerkUser, resolvedClaimCompanyId]);

  // After sign-up, if a pending claim exists, stay on onboarding so the claim
  // form renders. We used to auto-claim; now the user fills the form manually.
  const claimSynced = useRef(false);
  useEffect(() => {
    if (!clerkUser || claimSynced.current) return;
    const claimId = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (!claimId) return;
    claimSynced.current = true;
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
        onSuccess: () => {
          // Do NOT auto-claim; let the claim form render below.
          // Restore any previously entered claim data.
          const saved = sessionStorage.getItem(PENDING_CLAIM_DATA_KEY);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              claimForm.reset(parsed);
            } catch { /* ignore */ }
          }
        },
        onError: () => {
          // Same path on error — show the claim form
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser]);

  function doClaimCompany(companyId: string, values: z.infer<typeof claimSchema>) {
    customFetch(`/api/companies/${companyId}/claim`, {
      method: "POST",
      body: JSON.stringify(values),
    })
      .then(() => {
        sessionStorage.removeItem(PENDING_CLAIM_KEY);
        sessionStorage.removeItem(PENDING_CLAIM_DATA_KEY);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Workspace created successfully" });
        setLocation("/dashboard");
      })
      .catch((err: Error) => {
        toast({
          title: "Failed to create workspace",
          description: err?.message || "Company may already be claimed or invalid.",
          variant: "destructive",
        });
      });
  }

  function onSubmitClaim(values: z.infer<typeof claimSchema>) {
    if (!clerkUser) {
      sessionStorage.setItem(PENDING_CLAIM_KEY, resolvedClaimCompanyId);
      sessionStorage.setItem(PENDING_CLAIM_DATA_KEY, JSON.stringify(values));
      toast({
        title: "Create your account first",
        description: "Sign up below — then you can finish creating your workspace.",
      });
      setLocation("/sign-up");
      return;
    }
    doClaimCompany(resolvedClaimCompanyId, values);
  }

  // ── Create Flow (legacy self-serve) ─────────────────────────────────────
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!clerkUser || autoSubmitted.current || claimSynced.current) return;
    const raw = sessionStorage.getItem(PENDING_COMPANY_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as z.infer<typeof companySchema>;
      form.reset(saved);
      setActiveTab("create");
      autoSubmitted.current = true;
      sessionStorage.removeItem(PENDING_COMPANY_KEY);
      setTimeout(() => {
        form.handleSubmit(syncThenCreate)();
      }, 300);
    } catch {
      sessionStorage.removeItem(PENDING_COMPANY_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser]);

  function doCreate(values: z.infer<typeof companySchema>) {
    createCompany.mutate(
      { data: { ...values, ...(refCode ? { referredByCode: refCode } : {}) } as CreateCompanyBody & { referredByCode?: string } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          sessionStorage.removeItem(INVITE_TOKEN_KEY);
          sessionStorage.removeItem(PENDING_COMPANY_KEY);
          toast({ title: "Company created successfully" });
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Failed to create company",
            description: err?.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  }

  function syncThenCreate(values: z.infer<typeof companySchema>) {
    if (!clerkUser) return;
    if (dbUser) {
      doCreate(values);
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
        onSuccess: () => doCreate(values),
        onError: () => doCreate(values),
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
    syncThenCreate(values);
  }

  // ── Join Flow ─────────────────────────────────────────────────────────────
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
        onError: (err) => {
          // 410 means the invite was expired but a fresh one was auto-sent
          if (err?.status === 410) {
            toast({
              title: "Invite link expired",
              description:
                "Your invite link has expired. We've sent a fresh invite to your email address — please check your inbox.",
              duration: 8000,
            });
            return;
          }
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Site Snap</h1>
          <p className="mt-2 text-muted-foreground">
            {isSignupInviteMode
              ? "You're invited! Claim your workspace below."
              : isClaimMode
                ? "Let's finish setting up your workspace."
                : isWorker
                  ? "Enter the invite token your owner or foreman sent you to join your team."
                  : "Let's get your workspace set up."}
          </p>
        </div>

        {/* ── Signup Invite Claim Form (admin /sign-up?token= flow) ─────── */}
        {isSignupInviteMode && (
          <Card>
            <CardHeader>
              <CardTitle>Set up your workspace</CardTitle>
              <CardDescription>
                {signupInviteLoading
                  ? "Validating your invite…"
                  : signupInviteError
                    ? signupInviteError
                    : "Enter your company name and choose a plan. You'll be set as the owner."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signupInviteLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : signupInviteError ? (
                <p className="text-sm text-destructive text-center py-4">{signupInviteError}</p>
              ) : (
                <Form {...claimForm}>
                  <form onSubmit={claimForm.handleSubmit(onSubmitSignupInviteClaim)} className="space-y-4">
                    <FormField
                      control={claimForm.control}
                      name="companyName"
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
                        control={claimForm.control}
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
                        control={claimForm.control}
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
                      control={claimForm.control}
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
                    <FormField
                      control={claimForm.control}
                      name="planTier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subscription Plan</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a plan" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={claimForm.formState.isSubmitting || syncUser.isPending || !signupInviteCompanyId}
                    >
                      {(claimForm.formState.isSubmitting || syncUser.isPending) ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Create Workspace
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Legacy Claim Form (companyId in URL) ──────────────────────── */}
        {isClaimMode && (
          <Card>
            <CardHeader>
              <CardTitle>Create your workspace</CardTitle>
              <CardDescription>
                Enter your company name and choose a plan. You'll be set as the owner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...claimForm}>
                <form onSubmit={claimForm.handleSubmit(onSubmitClaim)} className="space-y-4">
                  <FormField
                    control={claimForm.control}
                    name="companyName"
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
                      control={claimForm.control}
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
                      control={claimForm.control}
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
                    control={claimForm.control}
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
                  <FormField
                    control={claimForm.control}
                    name="planTier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subscription Plan</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a plan" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="basic">Basic</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={claimForm.formState.isSubmitting}>
                    {claimForm.formState.isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Create Workspace
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* ── Create / Join Tabs (standard self-serve flow) ─────────────── */}
        {!isClaimMode && !isSignupInviteMode && (
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
                      <Button type="submit" className="w-full" disabled={syncUser.isPending || createCompany.isPending}>
                        {(syncUser.isPending || createCompany.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
        )}
      </div>
    </div>
  );
}
