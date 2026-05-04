import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowLeft, Pencil, Save, Loader2, Globe, Briefcase,
  MessageSquare, Sparkles, MapPin, Link as LinkIcon, Bell, CheckCircle2, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

const typeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  discussion: { label: "Discussion", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  job:        { label: "Job",        color: "bg-green-100 text-green-700", icon: Briefcase },
  showcase:   { label: "Showcase",   color: "bg-purple-100 text-purple-700", icon: Sparkles },
};

export default function TradehubProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const isMe = userId === "me";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: "", trade: "", location: "", province: "", bio: "", website: "" });

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: isMe ? ["tradehub-profile-me"] : ["tradehub-profile", userId],
    queryFn: () =>
      isMe
        ? customFetch("/api/tradehub/profile/me")
        : customFetch(`/api/tradehub/profile/${userId}`),
  });

  const { data: myProfile } = useQuery<any>({
    queryKey: ["tradehub-profile-me"],
    queryFn: () => customFetch("/api/tradehub/profile/me"),
    enabled: !isMe,
  });

  // Notifications (only for own profile)
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["tradehub-notifications"],
    queryFn: () => customFetch("/api/tradehub/notifications"),
    enabled: isMe,
  });

  const markReadMutation = useMutation({
    mutationFn: () => customFetch("/api/tradehub/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehub-notifications"] }),
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
      });
    }
  }, [profile, isMe]);

  const saveMutation = useMutation({
    mutationFn: () => customFetch("/api/tradehub/profile", {
      method: "PUT",
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-profile-me"] });
      setEditing(false);
      toast({ title: "Profile saved!" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save profile", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No profile yet — show setup form
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
            <Button className="w-full gap-2" onClick={() => saveMutation.mutate()} disabled={!form.displayName.trim() || saveMutation.isPending}>
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

  const displayData = isMe ? profile : profile;
  const recentPosts = isMe ? [] : (profile.recentPosts ?? []);
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
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="pt-6">
              {/* Avatar */}
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl mb-3">
                  {displayData.avatarUrl
                    ? <img src={displayData.avatarUrl} className="w-20 h-20 rounded-full object-cover" alt="" />
                    : initials}
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

          {/* TradeHub Nav */}
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
          {/* Edit form */}
          {editing && isMe && (
            <Card>
              <CardHeader><CardTitle className="text-base">Edit Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ProfileForm form={form} setForm={setForm} />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button onClick={() => saveMutation.mutate()} disabled={!form.displayName.trim() || saveMutation.isPending} className="gap-2">
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notifications (own profile only) */}
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

          {/* Recent posts (other user's profile) */}
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

          {/* Empty state for own profile with no posts */}
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
    </div>
  );
}

function ProfileForm({ form, setForm }: { form: any; setForm: any }) {
  const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
  const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

  return (
    <>
      <div>
        <Label>Display Name *</Label>
        <Input value={form.displayName} onChange={(e) => setForm((f: any) => ({ ...f, displayName: e.target.value }))} placeholder="John Smith" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Trade</Label>
          <Select value={form.trade} onValueChange={(v) => setForm((f: any) => ({ ...f, trade: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select trade" /></SelectTrigger>
            <SelectContent>{TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Province</Label>
          <Select value={form.province} onValueChange={(v) => setForm((f: any) => ({ ...f, province: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select province" /></SelectTrigger>
            <SelectContent>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>City / Location</Label>
        <Input value={form.location} onChange={(e) => setForm((f: any) => ({ ...f, location: e.target.value }))} placeholder="Toronto" className="mt-1" />
      </div>
      <div>
        <Label>Bio</Label>
        <Textarea value={form.bio} onChange={(e) => setForm((f: any) => ({ ...f, bio: e.target.value }))} placeholder="Tell the trade community about yourself…" rows={3} className="mt-1" />
      </div>
      <div>
        <Label>Website</Label>
        <Input value={form.website} onChange={(e) => setForm((f: any) => ({ ...f, website: e.target.value }))} placeholder="https://yourcompany.ca" className="mt-1" />
      </div>
    </>
  );
}
