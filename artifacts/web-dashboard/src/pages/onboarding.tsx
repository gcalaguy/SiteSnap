import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCompany, useAcceptInvitation } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getGetMeQueryKey } from "@workspace/api-client-react";

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

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  const [activeTab, setActiveTab] = useState(token ? "join" : "create");

  const createCompany = useCreateCompany();
  const acceptInvitation = useAcceptInvitation();

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      province: "",
      city: "",
      phone: "",
    },
  });

  const [inviteToken, setInviteToken] = useState(token || "");

  function onSubmitCreate(values: z.infer<typeof companySchema>) {
    createCompany.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
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

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken) return;

    acceptInvitation.mutate(
      { token: inviteToken },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to BuildCore</h1>
          <p className="mt-2 text-muted-foreground">Let's get your workspace set up.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create Company</TabsTrigger>
            <TabsTrigger value="join">Join Existing</TabsTrigger>
          </TabsList>
          
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
                      Create Company
                    </Button>
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
                  <Button type="submit" className="w-full" disabled={acceptInvitation.isPending || !inviteToken}>
                    {acceptInvitation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
