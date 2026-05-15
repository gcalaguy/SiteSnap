import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  useGetMe, useListCompanyMembers, useListInvitations,
  useCreateInvitation, useRemoveCompanyMember, useUpdateMemberRole,
  useUpdateInvitation, useRevokeInvitation,
  customFetch,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListCompanyMembersQueryKey, getListInvitationsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus, Loader2, MoreHorizontal, Mail, Copy, Check,
  Link2, Pencil, Trash2, AlertTriangle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function makeInviteLink(token: string) {
  return `${window.location.origin}${basePath}/onboarding?token=${token}`;
}

function getMemberInitials(m: { firstName?: string; lastName?: string; email?: string }) {
  const first = (m.firstName ?? "").trim();
  const last  = (m.lastName ?? "").trim();
  if (first || last) return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  return (m.email?.[0] ?? "?").toUpperCase();
}

function getMemberDisplayName(m: { firstName?: string; lastName?: string; email?: string }) {
  const full = `${(m.firstName ?? "").trim()} ${(m.lastName ?? "").trim()}`.trim();
  return full || null;
}

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "foreman", "worker"]).default("worker"),
});

const editInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "foreman", "worker"]),
});

const nameSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName:  z.string().min(1, "Last name is required"),
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

type Invite = { id: number; email: string; role: string; token: string; expiresAt?: string | null };

export default function Team() {
  const { data: user } = useGetMe();
  const companyId = user?.activeCompanyId;

  const { data: members, isLoading: membersLoading } = useListCompanyMembers(companyId || 0);
  const { data: invitations, isLoading: invitationsLoading } = useListInvitations({
    query: { queryKey: getListInvitationsQueryKey(), enabled: !!companyId },
  });

  const createInvitation = useCreateInvitation();
  const removeMember     = useRemoveCompanyMember();
  const updateRole       = useUpdateMemberRole();
  const { toast } = useToast();

  // ── dialog state ───────────────────────────────────────────────────────────
  const [isInviteOpen,    setIsInviteOpen]    = useState(false);
  const [newInviteToken,  setNewInviteToken]  = useState<string | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

  // member name edit
  const [editingMember, setEditingMember] = useState<{ id: number; firstName: string; lastName: string; email: string } | null>(null);

  // invitation edit
  const [editingInvite, setEditingInvite] = useState<Invite | null>(null);

  // invitation revoke confirm
  const [revokingInvite, setRevokingInvite] = useState<Invite | null>(null);

  // ── forms ──────────────────────────────────────────────────────────────────
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "worker" },
  });

  const editInviteForm = useForm<z.infer<typeof editInviteSchema>>({
    resolver: zodResolver(editInviteSchema),
    defaultValues: { email: "", role: "worker" },
  });

  const nameForm = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { firstName: "", lastName: "" },
  });

  // ── mutations ──────────────────────────────────────────────────────────────
  const updateName = useMutation({
    mutationFn: async ({ memberId, firstName, lastName }: { memberId: number; firstName: string; lastName: string }) =>
      customFetch<unknown>(`/api/companies/${companyId}/members/${memberId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      }),
    onSuccess: () => {
      if (companyId) queryClient.invalidateQueries({ queryKey: getListCompanyMembersQueryKey(companyId) });
      toast({ title: "Name updated" });
      setEditingMember(null);
    },
    onError: (err: any) =>
      toast({ title: "Failed to update name", description: err?.message, variant: "destructive" }),
  });

  const updateInvitation = useUpdateInvitation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
        toast({ title: "Invitation updated" });
        setEditingInvite(null);
      },
      onError: () => toast({ title: "Failed to update invitation", variant: "destructive" }),
    },
  });

  const revokeInvitation = useRevokeInvitation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
        toast({ title: "Invitation revoked" });
        setRevokingInvite(null);
      },
      onError: () => toast({ title: "Failed to revoke invitation", variant: "destructive" }),
    },
  });

  // ── handlers ───────────────────────────────────────────────────────────────
  function openEditInvite(invite: Invite) {
    setEditingInvite(invite);
    editInviteForm.reset({ email: invite.email, role: invite.role as any });
  }

  function onSubmitEditInvite(values: z.infer<typeof editInviteSchema>) {
    if (!editingInvite) return;
    updateInvitation.mutate({ id: editingInvite.id, data: values });
  }

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
        onError: (err: any) =>
          toast({ title: "Failed to send invitation", description: err?.message, variant: "destructive" }),
      },
    );
  }

  function openEditName(member: { id: number; firstName: string; lastName: string; email: string }) {
    setEditingMember(member);
    nameForm.reset({ firstName: member.firstName || "", lastName: member.lastName || "" });
  }

  function onSubmitName(values: z.infer<typeof nameSchema>) {
    if (!editingMember) return;
    updateName.mutate({ memberId: editingMember.id, firstName: values.firstName, lastName: values.lastName });
  }

  function handleRemoveMember(userId: number) {
    if (!companyId) return;
    if (confirm("Are you sure you want to remove this member?")) {
      removeMember.mutate({ companyId, userId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCompanyMembersQueryKey(companyId) });
          toast({ title: "Member removed" });
        },
      });
    }
  }

  function handleUpdateRole(userId: number, role: "owner" | "foreman" | "worker") {
    if (!companyId) return;
    updateRole.mutate({ companyId, userId, data: { role } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCompanyMembersQueryKey(companyId) });
        toast({ title: "Role updated" });
      },
    });
  }

  const isOwner = user?.role === "owner";
  const pendingInvites = (invitations ?? []).filter(i => i.status === "pending") as Invite[];

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
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
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl><Input placeholder="email@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
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

      {/* ── Invite link dialog (post-creation) ───────────────────────────────── */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Invite Link Ready
            </DialogTitle>
            <DialogDescription>
              Share this link with your team member. It expires in 7 days.
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

      {/* ── Member name edit dialog ───────────────────────────────────────────── */}
      <Dialog open={!!editingMember} onOpenChange={(open) => { if (!open) setEditingMember(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member Name</DialogTitle>
            <DialogDescription>Set a display name for <strong>{editingMember?.email}</strong>.</DialogDescription>
          </DialogHeader>
          <Form {...nameForm}>
            <form onSubmit={nameForm.handleSubmit(onSubmitName)} className="space-y-4">
              <FormField control={nameForm.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl><Input placeholder="e.g. John" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={nameForm.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Smith" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditingMember(null)}>Cancel</Button>
                <Button type="submit" disabled={updateName.isPending}>
                  {updateName.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Name
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Edit invitation dialog ────────────────────────────────────────────── */}
      <Dialog open={!!editingInvite} onOpenChange={(open) => { if (!open) setEditingInvite(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Invitation</DialogTitle>
            <DialogDescription>
              Update the email address or role for this pending invitation.
            </DialogDescription>
          </DialogHeader>
          <Form {...editInviteForm}>
            <form onSubmit={editInviteForm.handleSubmit(onSubmitEditInvite)} className="space-y-4">
              <FormField control={editInviteForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl><Input placeholder="email@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editInviteForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                <Button variant="outline" type="button" onClick={() => setEditingInvite(null)}>Cancel</Button>
                <Button type="submit" disabled={updateInvitation.isPending}>
                  {updateInvitation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Revoke confirmation dialog ────────────────────────────────────────── */}
      <Dialog open={!!revokingInvite} onOpenChange={(open) => { if (!open) setRevokingInvite(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Revoke Invitation
            </DialogTitle>
            <DialogDescription>
              This will immediately cancel the invite link sent to{" "}
              <strong>{revokingInvite?.email}</strong>. The link will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokingInvite(null)}>Keep It</Button>
            <Button
              variant="destructive"
              disabled={revokeInvitation.isPending}
              onClick={() => revokingInvite && revokeInvitation.mutate({ id: revokingInvite.id })}
            >
              {revokeInvitation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Active members card ───────────────────────────────────────────────── */}
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
              {(members as any[]).map(member => {
                const displayName = getMemberDisplayName(member);
                const initials = getMemberInitials(member);
                return (
                  <div key={member.id} className="flex items-center justify-between p-4 rounded-xl"
                    style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="font-bold text-sm" style={{ background: GOLD, color: BLACK }}>{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        {displayName ? (
                          <>
                            <p className="font-semibold text-white">{displayName}</p>
                            <p className="text-sm" style={{ color: GOLD }}>{member.email}</p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-white">{member.email}</p>
                            {isOwner && member.id !== user?.id && (
                              <button
                                type="button"
                                onClick={() => openEditName(member)}
                                className="text-xs flex items-center gap-1 mt-0.5 hover:underline"
                                style={{ color: GOLD }}
                              >
                                <Pencil className="h-3 w-3" /> Add name
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md"
                        style={{ background: GOLD, color: BLACK }}>
                        {(member.role ?? "worker").charAt(0).toUpperCase() + (member.role ?? "worker").slice(1)}
                      </span>
                      {isOwner && member.id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" style={{ color: GOLD }}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEditName(member)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit Name
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "owner")}>Make Owner</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "foreman")}>Make Foreman</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "worker")}>Make Worker</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleRemoveMember(member.id)} className="text-destructive">
                              Remove from Team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pending invitations card ──────────────────────────────────────────── */}
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
                <p className="text-sm">
                  No pending invitations. Use the <strong>Invite Member</strong> button above to generate a link.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvites.map(invite => (
                  <div key={invite.id} className="flex items-center justify-between gap-4 p-4 border rounded-md">
                    {/* Left: avatar + info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {(invite.role ?? "worker").charAt(0).toUpperCase() + (invite.role ?? "worker").slice(1)} ·{" "}
                          Expires {invite.expiresAt ? format(new Date(invite.expiresAt), "MMM d, yyyy") : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Right: copy + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <CopyButton text={makeInviteLink(invite.token)} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Invitation</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEditInvite(invite)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRevokingInvite(invite)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
