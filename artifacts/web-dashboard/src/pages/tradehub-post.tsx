import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft, ThumbsUp, MessageSquare, Briefcase, Send, Loader2,
  Flag, Trash2, CheckCircle2, Sparkles, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const typeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  discussion: { label: "Discussion", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  job:        { label: "Job",        color: "bg-green-100 text-green-700", icon: Briefcase },
  showcase:   { label: "Showcase",   color: "bg-purple-100 text-purple-700", icon: Sparkles },
};

export default function TradehubPostPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const [comment, setComment] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const { data: post, isLoading } = useQuery<any>({
    queryKey: ["tradehub-post", id],
    queryFn: () => customFetch(`/api/tradehub/posts/${id}`),
  });

  const { data: myProfile } = useQuery<any>({
    queryKey: ["tradehub-profile-me"],
    queryFn: () => customFetch("/api/tradehub/profile/me"),
  });

  const reactMutation = useMutation({
    mutationFn: () => customFetch(`/api/tradehub/posts/${id}/react`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehub-post", id] }),
  });

  const commentMutation = useMutation({
    mutationFn: () => customFetch(`/api/tradehub/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: comment }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-post", id] });
      setComment("");
      toast({ title: "Comment added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to comment", variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: () => customFetch(`/api/tradehub/jobs/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ message: applyMessage }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-post", id] });
      setShowApply(false);
      toast({ title: "Application sent!", description: "The poster will be notified." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Already applied or failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => customFetch(`/api/tradehub/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-feed"] });
      setLocation("/tradehub");
      toast({ title: "Post deleted" });
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => customFetch("/api/tradehub/reports", {
      method: "POST",
      body: JSON.stringify({ targetType: "post", targetId: parseInt(id), reason: reportReason }),
    }),
    onSuccess: () => {
      setShowReport(false);
      toast({ title: "Report submitted", description: "Thank you. Our team will review it." });
    },
  });

  const updateApplicationMutation = useMutation({
    mutationFn: ({ appId, status }: { appId: number; status: string }) =>
      customFetch(`/api/tradehub/applications/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-post", id] });
      toast({ title: "Application updated" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!post) {
    return <div className="p-6 text-center text-muted-foreground">Post not found.</div>;
  }

  const tc = typeConfig[post.type] ?? typeConfig.discussion;
  const TypeIcon = tc.icon;
  const isOwner = post.userId === (me as any)?.id;
  const initials = post.profile?.displayName
    ? post.profile.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : `${post.author?.firstName?.[0] ?? ""}${post.author?.lastName?.[0] ?? ""}`;

  // Check if current user already applied
  const myApplication = post.applications?.find((a: any) => a.applicantId === (me as any)?.id);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/tradehub")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Link href="/tradehub"><span className="hover:text-foreground cursor-pointer">TradeHub</span></Link>
          <span>/</span>
          <span className="text-foreground">{post.title}</span>
        </nav>
      </div>

      {/* Post */}
      <Card className="mb-6">
        <CardContent className="p-6">
          {/* Author */}
          <div className="flex items-start gap-4 mb-4">
            <Link href={`/tradehub/profile/${post.userId}`}>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold cursor-pointer hover:opacity-80 flex-shrink-0">
                {post.profile?.avatarUrl
                  ? <img src={post.profile.avatarUrl} className="w-12 h-12 rounded-full object-cover" alt="" />
                  : initials}
              </div>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/tradehub/profile/${post.userId}`}>
                  <span className="font-semibold hover:underline cursor-pointer">
                    {post.profile?.displayName ?? `${post.author?.firstName} ${post.author?.lastName}`}
                  </span>
                </Link>
                {post.profile?.isVerified && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">✓ Verified</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${tc.color}`}>
                  <TypeIcon className="h-3 w-3" />{tc.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                {post.profile?.trade && <span>{post.profile.trade}</span>}
                {post.province && <span>· {post.province}</span>}
                {post.trade && <span>· {post.trade}</span>}
                <span>· {format(new Date(post.createdAt), "MMMM d, yyyy")}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isOwner && (
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate()}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {!isOwner && (
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setShowReport(true)}>
                  <Flag className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <h1 className="text-xl font-bold text-foreground mb-3">{post.title}</h1>
          <p className="text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

          {/* Job metadata */}
          {post.type === "job" && (post.budget || post.jobType) && (
            <div className="mt-4 flex gap-2 flex-wrap">
              {post.jobType && <Badge variant="outline">{post.jobType}</Badge>}
              {post.budget && <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">{post.budget}</Badge>}
            </div>
          )}

          {/* Media */}
          {post.media?.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {post.media.map((m: any) => (
                <img key={m.id} src={m.url} className="rounded-lg object-cover w-full aspect-video" alt="" />
              ))}
            </div>
          )}

          {/* Reactions / Apply */}
          <div className="mt-5 pt-4 border-t flex items-center gap-4">
            <button
              onClick={() => reactMutation.mutate()}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${post.hasReacted ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            >
              <ThumbsUp className={`h-4 w-4 ${post.hasReacted ? "fill-primary" : ""}`} />
              {post.reactionCount > 0 ? post.reactionCount : ""} Like{post.reactionCount !== 1 ? "s" : ""}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              {post.commentCount} Comment{post.commentCount !== 1 ? "s" : ""}
            </span>
            {post.type === "job" && !isOwner && (
              <div className="ml-auto">
                {myApplication ? (
                  <Badge variant="outline" className="gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    Applied · {myApplication.status}
                  </Badge>
                ) : (
                  <Button onClick={() => setShowApply(true)} className="gap-2">
                    <Briefcase className="h-4 w-4" />Apply Now
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Applications (visible to post owner) */}
      {isOwner && post.type === "job" && post.applications?.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Applications ({post.applications.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {post.applications.map((app: any) => (
              <div key={app.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-medium">Applicant #{app.applicantId}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(app.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <Badge variant={app.status === "accepted" ? "default" : app.status === "rejected" ? "destructive" : "secondary"}>
                    {app.status}
                  </Badge>
                </div>
                {app.message && <p className="text-sm text-muted-foreground mb-3 italic">"{app.message}"</p>}
                {app.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateApplicationMutation.mutate({ appId: app.id, status: "accepted" })}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => updateApplicationMutation.mutate({ appId: app.id, status: "reviewed" })}>Reviewed</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => updateApplicationMutation.mutate({ appId: app.id, status: "rejected" })}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments ({post.comments?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(post.comments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first!</p>
          ) : (
            <div className="space-y-4">
              {(post.comments ?? []).map((c: any) => {
                const cInitials = c.profile?.displayName
                  ? c.profile.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
                  : `${c.author?.firstName?.[0] ?? ""}${c.author?.lastName?.[0] ?? ""}`;
                return (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                      {cInitials}
                    </div>
                    <div className="flex-1 bg-muted/40 rounded-xl px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-semibold">
                          {c.profile?.displayName ?? `${c.author?.firstName} ${c.author?.lastName}`}
                        </p>
                        <p className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, h:mm a")}</p>
                      </div>
                      <p className="text-sm mt-0.5">{c.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Separator />

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0 mt-0.5">
              {myProfile?.displayName?.[0]?.toUpperCase() ?? (me as any)?.firstName?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 flex gap-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment…"
                rows={2}
                className="resize-none flex-1"
              />
              <Button
                size="icon"
                onClick={() => commentMutation.mutate()}
                disabled={!comment.trim() || commentMutation.isPending}
                className="self-end"
              >
                {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Apply Modal */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply for this Job</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Applying to: <strong>{post.title}</strong></p>
            <div>
              <Label>Cover Message (optional)</Label>
              <Textarea
                value={applyMessage}
                onChange={(e) => setApplyMessage(e.target.value)}
                placeholder="Introduce yourself and explain why you're a great fit…"
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowApply(false)}>Cancel</Button>
            <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} className="gap-2">
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report this Post</DialogTitle></DialogHeader>
          <div>
            <Label>Reason for reporting</Label>
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Spam, harassment, inappropriate content…"
              rows={3}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReport(false)}>Cancel</Button>
            <Button onClick={() => reportMutation.mutate()} disabled={!reportReason.trim() || reportMutation.isPending} variant="destructive">
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
