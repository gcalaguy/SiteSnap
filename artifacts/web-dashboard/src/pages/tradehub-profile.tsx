import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  useGetMe,
  useGetTradehubProfileMe,
  useGetTradehubProfile,
  useListTradehubNotifications,
  useUpsertTradehubProfile,
  useMarkAllTradehubNotificationsRead,
  useGetTradeReviewSummary,
  useListTradeReviews,
  useSubmitTradeReview,
  getGetTradehubProfileMeQueryKey,
  getListTradehubNotificationsQueryKey,
  getGetTradeReviewSummaryQueryKey,
  getListTradeReviewsQueryKey,
  GetTradeReviewSummaryTargetType
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft, Pencil, Save, Loader2, Globe, Briefcase,
  MessageSquare, Sparkles, MapPin, Link as LinkIcon, Bell, CheckCircle2, MessageCircle,
  Upload, Trash2, FileText, Image as ImageIcon, X,
} from "lucide-react";
import { SignedAvatar } from "@/components/SignedAvatar";
import { SignedImage } from "@/components/SignedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReviewSummaryCard } from "@/components/tradehub/ReviewSummaryCard";
import { ReviewFeedList } from "@/components/tradehub/ReviewFeedList";
import { ReviewFormModal } from "@/components/tradehub/ReviewFormModal";

const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

const typeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  discussion: { label: "Discussion", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  job:        { label: "Job",        color: "bg-green-100 text-green-700", icon: Briefcase },
  showcase:   { label: "Showcase",   color: "bg-emerald-100 text-emerald-700", icon: Sparkles },
};

export default function TradehubProfilePage() {
  const { userId } = useParams<{ userId: string }>();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const isMe = userId === "me";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: "", trade: "", location: "", province: "", bio: "", website: "", complianceStatus: "compliant", avatarUrl: "" });

  const { data: profileMe, isLoading: loadingMe } = useGetTradehubProfileMe();
  const { data: profileOther, isLoading: loadingOther } = useGetTradehubProfile(
    parseInt(userId ?? "0"),
    { query: { enabled: !!userId && userId !== "me" } as any },
  );
  const profile = isMe ? profileMe : profileOther;
  const isLoading = isMe ? loadingMe : loadingOther;


  const { data: notifications = [] } = useListTradehubNotifications();

  const [showReviewModal, setShowReviewModal] = useState(false);

  const targetUserId = isMe ? me?.id : (profile?.userId ?? parseInt(userId ?? "0"));
  const targetType = isMe ? undefined : "user_worker";

  const { data: reviewSummary } = useGetTradeReviewSummary(
    { targetType: targetType as GetTradeReviewSummaryTargetType, targetUserId },
    { query: { enabled: !isMe && !!targetUserId } as any },
  );

  const { data: reviewList } = useListTradeReviews(
    { targetType: targetType as GetTradeReviewSummaryTargetType, targetUserId, page: 1, limit: 10 },
    { query: { enabled: !isMe && !!targetUserId } as any },
  );

  const submitReviewMutation = useSubmitTradeReview({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTradeReviewSummaryQueryKey({ targetType: targetType as GetTradeReviewSummaryTargetType, targetUserId }) });
        queryClient.invalidateQueries({ queryKey: getListTradeReviewsQueryKey({ targetType: targetType as GetTradeReviewSummaryTargetType, targetUserId, page: 1, limit: 10 }) });
        setShowReviewModal(false);
        toast({ title: "Review submitted!" });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.message || "Failed to submit review", variant: "destructive" });
      },
    },
  });

  const markReadMutation = useMarkAllTradehubNotificationsRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTradehubNotificationsQueryKey() }),
    },
  });

  useEffect(() => {
    if (profile && isMe) {
      setForm({
        displayName: profile.displayName ?? "",
        trade: profile.trade ?? "",
        location: profile.location ?? "",
        province: profile.province ?? "",
        bio: profile.bio ?? "",
        website: profile.website ?? "",
        complianceStatus: profile.complianceStatus ?? "compliant",
        avatarUrl: profile.avatarUrl ?? "",
      });
    }
  }, [profile, isMe]);

  const saveMutation = useUpsertTradehubProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTradehubProfileMeQueryKey() });
        setEditing(false);
        toast({ title: "Profile saved!" });
      },
      onError: () => toast({ title: "Error", description: "Failed to save profile", variant: "destructive" }),
    },
  });

  const { data: myMedia = [] } = useQuery<any[]>({
    queryKey: ["tradehub-profile-media-me"],
    queryFn: () => customFetch("/api/tradehub/profile/me/media"),
    enabled: isMe,
  });
  const { data: theirMedia = [] } = useQuery<any[]>({
    queryKey: ["tradehub-profile-media", userId],
    queryFn: () => customFetch(`/api/tradehub/profile/${userId}/media`),
    enabled: !isMe,
  });
  const profileMedia: any[] = isMe ? myMedia : theirMedia;

  const addMediaMutation = useMutation({
    mutationFn: (payload: { url: string; objectPath?: string; mediaType: string; fileName?: string }) =>
      customFetch("/api/tradehub/profile/me/media", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehub-profile-media-me"] }),
    onError: () => toast({ title: "Error", description: "Failed to save media", variant: "destructive" }),
  });
  const deleteMediaMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/tradehub/profile/media/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehub-profile-media-me"] }),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile && isMe) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/tradehub"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-xl font-bold">Set Up Your TradeHub Profile</h1>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <ProfileForm form={form} setForm={setForm} />
            <Button className="w-full gap-2" onClick={() => saveMutation.mutate({ data: form as any })} disabled={!form.displayName.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return <div className="p-6 text-center text-muted-foreground">Profile not found.</div>;
  }

  const displayData = profile;
  const recentPosts = isMe ? [] : (displayData.recentPosts ?? []);
  const initials = displayData.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "??";
  const unreadNotifs = notifications.filter((n: any) => !n.isRead);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tradehub"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Link href="/tradehub"><span className="hover:text-foreground cursor-pointer">TradeHub</span></Link>
          <span>/</span>
          <span className="text-foreground">{isMe ? "My Profile" : displayData.displayName}</span>
        </nav>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl mb-3">
                  <SignedAvatar url={displayData.avatarUrl} sizeClass="w-20 h-20" initials={initials} />
                </div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  {displayData.displayName}
                  {displayData.isVerified && (
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  )}
                </h2>
                {displayData.trade && <p className="text-sm text-muted-foreground">{displayData.trade}</p>}
                {(displayData.location || displayData.province) && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[displayData.location, displayData.province].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>

              {displayData.bio && (
                <p className="text-sm text-muted-foreground text-center leading-relaxed mb-4">{displayData.bio}</p>
              )}

              {displayData.website && (
                <a href={displayData.website} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline justify-center mb-4">
                  <LinkIcon className="h-3 w-3" />{displayData.website.replace(/^https?:\/\//, "")}
                </a>
              )}

              {isMe ? (
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setEditing(!editing)}>
                  <Pencil className="h-3.5 w-3.5" />{editing ? "Cancel Edit" : "Edit Profile"}
                </Button>
              ) : (
                <Link href="/tradehub/messages">
                  <Button size="sm" className="w-full gap-2">
                    <MessageCircle className="h-3.5 w-3.5" />Send Message
                  </Button>
                </Link>
              )}

            </CardContent>
          </Card>

          {!isMe && reviewSummary && (
            <ReviewSummaryCard
              average={reviewSummary?.average ?? 0}
              total={reviewSummary?.total ?? 0}
              distribution={reviewSummary?.distribution}
              onWriteReview={() => setShowReviewModal(true)}
              canWriteReview={!!me && me?.id !== targetUserId}
            />
          )}

          <Card>
            <CardContent className="p-2 space-y-1">
              {[
                { href: "/tradehub", label: "Feed", icon: Globe },
                { href: "/tradehub/jobs", label: "Job Board", icon: Briefcase },
              ].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Icon className="h-4 w-4" />{label}
                  </button>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* ── Photos & Documents ── */}
          {(isMe || profileMedia.length > 0) && (
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Photos &amp; Documents
                </CardTitle>
                {isMe && (
                  <ProfileMediaUploader
                    onUploaded={(item) => addMediaMutation.mutate(item)}
                  />
                )}
              </CardHeader>
              <CardContent>
                {profileMedia.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {isMe ? "Upload photos or documents to showcase your work." : "No media uploaded yet."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Photos */}
                    {profileMedia.filter((m: any) => m.mediaType === "photo").length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Photos</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {profileMedia.filter((m: any) => m.mediaType === "photo").map((m: any) => (
                            <div key={m.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                              <SignedImage src={m.url} alt={m.fileName ?? ""} className="object-cover w-full h-full" />
                              {isMe && (
                                <button
                                  onClick={() => deleteMediaMutation.mutate(m.id)}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Documents */}
                    {profileMedia.filter((m: any) => m.mediaType === "document").length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Documents</p>
                        <div className="space-y-1.5">
                          {profileMedia.filter((m: any) => m.mediaType === "document").map((m: any) => (
                            <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors group">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <a
                                href={m.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 text-sm truncate hover:underline text-foreground"
                              >
                                {m.fileName ?? "Document"}
                              </a>
                              {isMe && (
                                <button
                                  onClick={() => deleteMediaMutation.mutate(m.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {editing && isMe && (
            <Card>
              <CardHeader><CardTitle className="text-base">Edit Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ProfileForm form={form} setForm={setForm} />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button onClick={() => saveMutation.mutate({ data: form as any })} disabled={!form.displayName.trim() || saveMutation.isPending} className="gap-2">
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isMe && notifications.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                  {unreadNotifs.length > 0 && (
                    <Badge className="ml-1">{unreadNotifs.length} new</Badge>
                  )}
                </CardTitle>
                {unreadNotifs.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => markReadMutation.mutate()}>Mark all read</Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {notifications.slice(0, 10).map((n: any) => (
                  <div key={n.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${n.isRead ? "bg-muted/30" : "bg-primary/5 border border-primary/10"}`}>
                    <Bell className={`h-4 w-4 flex-shrink-0 mt-0.5 ${n.isRead ? "text-muted-foreground" : "text-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(n.createdAt), "MMM d, h:mm a")}</p>
                    </div>
                    {n.referenceId && (
                      <Link href={`/tradehub/posts/${n.referenceId}`}>
                        <Button variant="ghost" size="sm" className="text-xs flex-shrink-0">View</Button>
                      </Link>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!isMe && recentPosts.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recent Posts</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {recentPosts.map((post: any) => {
                  const tc = typeConfig[post.type] ?? typeConfig.discussion;
                  const Icon = tc.icon;
                  return (
                    <Link key={post.id} href={`/tradehub/posts/${post.id}`}>
                      <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tc.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{post.title}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(post.createdAt), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {!isMe && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                <ReviewFeedList
                  reviews={reviewList?.reviews ?? []}
                  hasMore={reviewList?.hasMore}
                />
              </CardContent>
            </Card>
          )}

          {isMe && !editing && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <Globe className="h-10 w-10 text-muted-foreground/30" />
                <p className="font-medium text-muted-foreground">Your TradeHub Activity</p>
                <p className="text-sm text-muted-foreground">Posts you create will appear on the feed and here.</p>
                <Link href="/tradehub">
                  <Button variant="outline" className="gap-2 mt-1">
                    <Globe className="h-4 w-4" />Go to Feed
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {!isMe && (
        <ReviewFormModal
          open={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          onSubmit={(rating, comment) => submitReviewMutation.mutate({ data: { targetType: targetType as GetTradeReviewSummaryTargetType, targetUserId, rating, comment: comment || undefined } })}
          isSubmitting={submitReviewMutation.isPending}
          targetName={displayData.displayName ?? "this profile"}
        />
      )}
    </div>
  );
}

function ProfileMediaUploader({ onUploaded }: {
  onUploaded: (item: { url: string; objectPath?: string; mediaType: string; fileName?: string }) => void
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/tradehub/uploads/file", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Upload failed");
      }
      const { objectPath, fileName } = await res.json() as { objectPath: string; fileName: string };
      const isImage = file.type.startsWith("image/");
      onUploaded({
        url: objectPath,
        objectPath,
        mediaType: isImage ? "photo" : "document",
        fileName: file.name ?? fileName,
      });
      toast({ title: isImage ? "Photo uploaded!" : "Document uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-7"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Add"}
      </Button>
    </>
  );
}

function ProfileForm({ form, setForm }: { form: any; setForm: any }) {
  const { toast } = useToast();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Images only", description: "Please pick a JPEG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tradehub/uploads/file", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Upload failed"); }
      const { objectPath } = await res.json() as { objectPath: string };
      setForm((p: any) => ({ ...p, avatarUrl: objectPath }));
      toast({ title: "Photo updated — save to apply." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (avatarRef.current) avatarRef.current.value = "";
    }
  }

  return (
    <>
      {/* Avatar upload */}
      <div className="flex items-center gap-4 pb-2">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex-shrink-0">
          <SignedAvatar url={form.avatarUrl} sizeClass="w-16 h-16" initials={form.displayName?.slice(0, 2).toUpperCase() ?? "?"} />
        </div>
        <div>
          <input ref={avatarRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); }} />
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={avatarUploading} onClick={() => avatarRef.current?.click()}>
            {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {avatarUploading ? "Uploading…" : "Change Photo"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG or WebP · max 10 MB</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Display Name *</Label>
        <Input value={form.displayName} onChange={(e) => setForm((p: any) => ({ ...p, displayName: e.target.value }))} placeholder="Your name as tradespeople will see it" />
      </div>
      <div className="space-y-1.5">
        <Label>Trade</Label>
        <Select value={form.trade} onValueChange={(v) => setForm((p: any) => ({ ...p, trade: v }))}>
          <SelectTrigger><SelectValue placeholder="Select your trade" /></SelectTrigger>
          <SelectContent>{TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={form.location} onChange={(e) => setForm((p: any) => ({ ...p, location: e.target.value }))} placeholder="e.g. Calgary" />
        </div>
        <div className="space-y-1.5">
          <Label>Province</Label>
          <Select value={form.province} onValueChange={(v) => setForm((p: any) => ({ ...p, province: v }))}>
            <SelectTrigger><SelectValue placeholder="Prov." /></SelectTrigger>
            <SelectContent>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Bio</Label>
        <Textarea value={form.bio} onChange={(e) => setForm((p: any) => ({ ...p, bio: e.target.value }))} placeholder="A few lines about your experience, specialties, and availability…" rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Website / LinkedIn</Label>
        <Input value={form.website} onChange={(e) => setForm((p: any) => ({ ...p, website: e.target.value }))} placeholder="https://" />
      </div>
      <div className="space-y-1.5">
        <Label>Compliance Status</Label>
        <Select value={form.complianceStatus} onValueChange={(v) => setForm((p: any) => ({ ...p, complianceStatus: v }))}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="compliant">Compliant</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="non_compliant">Non-Compliant</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Used to gate bidding on tender projects.</p>
      </div>
    </>
  );
}
