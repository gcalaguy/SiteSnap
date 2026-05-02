import { useState } from "react";
import { useGetMe, useListCompanyMembers, useListInvitations, useCreateInvitation, useRemoveCompanyMember, useUpdateMemberRole } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListCompanyMembersQueryKey, getListInvitationsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Loader2, MoreHorizontal, Mail, Copy, Check, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function makeInviteLink(token: string) {
  return `${window.location.origin}${basePath}/onboarding?token=${token}`;
}

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "foreman", "worker"]).default("worker"),
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy Link"}
    </Button>
  );
}

export default function Team() {
  const { data: user } = useGetMe();
  const companyId = user?.companyId;

  const { data: members, isLoading: membersLoading } = useListCompanyMembers(companyId || 0);

  const { data: invitations, isLoading: invitationsLoading } = useListInvitations({
    query: { queryKey: getListInvitationsQueryKey(), enabled: !!companyId }
  });

  const createInvitation = useCreateInvitation();
  const removeMember = useRemoveCompanyMember();
  const updateRole = useUpdateMemberRole();
  const { toast } = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newInviteToken, setNewInviteToken] = useState<string | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "worker" },
  });

  function onSubmitInvite(values: z.infer<typeof inviteSchema>) {
    createInvitation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
          setIsInviteOpen(false);
          form.reset();
          setNewInviteToken(data.token);
          setIsLinkDialogOpen(true);
        },
        onError: (err: any) => {
          toast({
            title: "Failed to send invitation",
            description: err?.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  }

  function handleRemoveMember(userId: number) {
    if (!companyId) return;
    if (confirm("Are you sure you want to remove this member?")) {
      removeMember.mutate({ companyId, userId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCompanyMembersQueryKey(companyId) });
          toast({ title: "Member removed" });
        }
      });
    }
  }

  function handleUpdateRole(userId: number, role: "owner" | "foreman" | "worker") {
    if (!companyId) return;
    updateRole.mutate({ companyId, userId, data: { role } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCompanyMembersQueryKey(companyId) });
        toast({ title: "Role updated" });
      }
    });
  }

  const isOwner = user?.role === "owner";
  const pendingInvites = (invitations ?? []).filter(i => i.status === "pending");

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground">Manage your crew and their access levels.</p>
        </div>
        {isOwner && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite to Team</DialogTitle>
                <DialogDescription>
                  An invite link will be generated. Share it with the person you want to add.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitInvite)} className="space-y-4">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input placeholder="email@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="foreman">Foreman</SelectItem>
                          <SelectItem value="worker">Worker</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="submit" disabled={createInvitation.isPending}>
                      {createInvitation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Generate Invite Link
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Invite link dialog shown after creation */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Invite Link Ready
            </DialogTitle>
            <DialogDescription>
              Share this link with your team member. It expires in 7 days. They'll need to sign up or log in first, then the link will add them to your company automatically.
            </DialogDescription>
          </DialogHeader>
          {newInviteToken && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md border">
                <p className="text-xs font-mono text-muted-foreground break-all flex-1 select-all">
                  {makeInviteLink(newInviteToken)}
                </p>
              </div>
              <CopyButton text={makeInviteLink(newInviteToken)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Active Members</CardTitle>
          <CardDescription>People currently in your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="py-4 text-center text-muted-foreground animate-pulse">Loading members...</div>
          ) : !members?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>
          ) : (
            <div className="space-y-3">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-md bg-muted/20">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10 bg-primary/20 text-primary border border-primary/20">
                      <AvatarFallback>{member.firstName[0]}{member.lastName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={member.role === "owner" ? "default" : member.role === "foreman" ? "secondary" : "outline"}>
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </Badge>
                    {isOwner && member.id !== user?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "owner")}>Make Owner</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "foreman")}>Make Foreman</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "worker")}>Make Worker</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleRemoveMember(member.id)} className="text-destructive">Remove from Team</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              Active invite links you've generated. Each expires 7 days after creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitationsLoading ? (
              <div className="py-4 text-center text-muted-foreground animate-pulse">Loading...</div>
            ) : pendingInvites.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground space-y-2">
                <Mail className="h-8 w-8 mx-auto opacity-30" />
                <p className="text-sm">No pending invitations. Use the <strong>Invite Member</strong> button above to generate a link.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvites.map(invite => (
                  <div key={invite.id} className="flex items-center justify-between gap-4 p-4 border rounded-md">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} · Expires {invite.expiresAt ? format(new Date(invite.expiresAt), "MMM d, yyyy") : "—"}
                        </p>
                      </div>
                    </div>
                    <CopyButton text={makeInviteLink(invite.token)} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
