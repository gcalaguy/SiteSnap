import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Globe, Plus, ThumbsUp, MessageSquare, Briefcase, Image as ImageIcon,
  Hammer, Search, Bell, User, ChevronRight, X, Send, Loader2,
  Sparkles, Wrench, Users, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

const typeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  discussion: { label: "Discussion", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  job:        { label: "Job",        color: "bg-green-100 text-green-700", icon: Briefcase },
  showcase:   { label: "Showcase",   color: "bg-purple-100 text-purple-700", icon: Sparkles },
};

interface Post {
  id: number; userId: number; type: string; title: string; content: string;
  trade: string | null; location: string | null; province: string | null;
  budget: string | null; jobType: string | null; createdAt: string;
  commentCount: number; reactionCount: number; hasReacted: boolean;
  applicationCount: number;
  author: { id: number; firstName: string; lastName: string } | null;
  profile: { displayName: string; trade: string | null; isVerified: boolean; avatarUrl: string | null } | null;
  media: Array<{ id: number; url: string }>;
}

function PostCard({ post, onReact }: { post: Post; onReact: (id: number) => void }) {
  const tc = typeConfig[post.type] ?? typeConfig.discussion;
  const Icon = tc.icon;
  const initials = post.profile?.displayName
    ? post.profile.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : (post.author ? `${post.author.firstName[0]}${post.author.lastName[0]}` : "??");

  return (
    <Card className="hover:shadow-md transition-shadow border-border/60">
      <CardContent className="p-4">
        {/* Author row */}
        <div className="flex items-start gap-3 mb-3">
          <Link href={`/tradehub/profile/${post.userId}`}>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0 cursor-pointer hover:opacity-80">
              {post.profile?.avatarUrl
                ? <img src={post.profile.avatarUrl} className="w-10 h-10 rounded-full object-cover" alt="" />
                : initials}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/tradehub/profile/${post.userId}`}>
                <span className="font-semibold text-sm text-foreground hover:underline cursor-pointer">
                  {post.profile?.displayName ?? `${post.author?.firstName} ${post.author?.lastName}`}
                </span>
              </Link>
              {post.profile?.isVerified && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">✓ Verified</span>
              )}
              {post.profile?.trade && (
                <span className="text-xs text-muted-foreground">{post.profile.trade}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${tc.color}`}>
                <Icon className="h-2.5 w-2.5" />{tc.label}
              </span>
              {post.province && <span className="text-xs text-muted-foreground">{post.province}</span>}
              {post.trade && <span className="text-xs text-muted-foreground">· {post.trade}</span>}
              <span className="text-xs text-muted-foreground ml-auto">{format(new Date(post.createdAt), "MMM d")}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <Link href={`/tradehub/posts/${post.id}`}>
          <div className="cursor-pointer group">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">{post.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{post.content}</p>
          </div>
        </Link>

        {/* Job metadata */}
        {post.type === "job" && (post.budget || post.jobType) && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {post.jobType && <Badge variant="outline" className="text-xs">{post.jobType}</Badge>}
            {post.budget && <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">{post.budget}</Badge>}
          </div>
        )}

        {/* Media */}
        {post.media.length > 0 && (
          <div className={`mt-3 grid gap-1.5 ${post.media.length === 1 ? "" : "grid-cols-2"}`}>
            {post.media.slice(0, 4).map((m) => (
              <img key={m.id} src={m.url} className="rounded-lg object-cover w-full aspect-video" alt="" />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-4">
          <button
            onClick={() => onReact(post.id)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${post.hasReacted ? "text-primary font-medium" : "text-muted-foreground hover:text-primary"}`}
          >
            <ThumbsUp className={`h-4 w-4 ${post.hasReacted ? "fill-primary" : ""}`} />
            {post.reactionCount > 0 && post.reactionCount}
          </button>
          <Link href={`/tradehub/posts/${post.id}`}>
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <MessageSquare className="h-4 w-4" />
              {post.commentCount > 0 && post.commentCount}
            </button>
          </Link>
          {post.type === "job" && (
            <Link href={`/tradehub/posts/${post.id}`}>
              <button className="ml-auto text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-medium hover:bg-primary/90 transition-colors">
                {post.userId !== undefined && post.applicationCount > 0
                  ? `${post.applicationCount} Applied`
                  : "Apply Now"}
              </button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePostModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [type, setType] = useState("discussion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [trade, setTrade] = useState("");
  const [province, setProvince] = useState("");
  const [budget, setBudget] = useState("");
  const [jobType, setJobType] = useState("");

  const createMutation = useMutation({
    mutationFn: () => customFetch("/api/tradehub/posts", {
      method: "POST",
      body: JSON.stringify({ type, title, content, trade: trade || undefined, province: province || undefined, budget: budget || undefined, jobType: jobType || undefined }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-feed"] });
      toast({ title: "Post published to TradeHub!" });
      onClose();
      setTitle(""); setContent(""); setType("discussion");
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed to post", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New TradeHub Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["discussion", "job", "showcase"] as const).map((t) => {
              const cfg = typeConfig[t];
              const Ic = cfg.icon;
              return (
                <button key={t} onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-medium transition-all ${type === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <Ic className="h-4 w-4" />{cfg.label}
                </button>
              );
            })}
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "job" ? "e.g. Looking for Electrician — Toronto" : "e.g. Tips for concrete work in winter"} className="mt-1" />
          </div>
          <div>
            <Label>Details *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder={type === "job" ? "Describe the job, requirements, timeline…" : "Share your experience, question, or project…"} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trade</Label>
              <Select value={trade} onValueChange={setTrade}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Any trade" /></SelectTrigger>
                <SelectContent>{TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Province</Label>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="All provinces" /></SelectTrigger>
                <SelectContent>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {type === "job" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Budget / Rate</Label>
                <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. $75/hr or $5,000" className="mt-1" />
              </div>
              <div>
                <Label>Job Type</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="subcontract">Subcontract</SelectItem>
                    <SelectItem value="one-time">One-time project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || !content.trim() || createMutation.isPending} className="gap-2">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TradehubFeedPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");

  const params = new URLSearchParams();
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (tradeFilter !== "all") params.set("trade", tradeFilter);
  if (provinceFilter !== "all") params.set("province", provinceFilter);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["tradehub-feed", typeFilter, tradeFilter, provinceFilter],
    queryFn: ({ pageParam = 1 }) =>
      customFetch(`/api/tradehub/feed?${params.toString()}&page=${pageParam}`),
    getNextPageParam: (last: any) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["tradehub-notifications"],
    queryFn: () => customFetch("/api/tradehub/notifications"),
  });
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const { data: myProfile } = useQuery<any>({
    queryKey: ["tradehub-profile-me"],
    queryFn: () => customFetch("/api/tradehub/profile/me"),
  });

  const reactMutation = useMutation({
    mutationFn: (postId: number) =>
      customFetch(`/api/tradehub/posts/${postId}/react`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tradehub-feed"] }),
  });

  const posts: Post[] = data?.pages.flatMap((p: any) => p.posts) ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0A0A0A] rounded-xl">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">TradeHub</h1>
            <p className="text-sm text-muted-foreground">Canada's construction trade network</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/tradehub/notifications">
            <Button variant="outline" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground rounded-full text-[10px] flex items-center justify-center font-bold">{unreadCount}</span>
              )}
            </Button>
          </Link>
          <Link href="/tradehub/profile/me">
            <Button variant="outline" size="icon"><User className="h-4 w-4" /></Button>
          </Link>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />Post
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile card */}
          <div className="rounded-xl p-4" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            {myProfile ? (
              <Link href="/tradehub/profile/me">
                <div className="flex items-center gap-3 cursor-pointer group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: GOLD, color: BLACK }}>
                    {myProfile.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-white">{myProfile.displayName}</p>
                    <p className="text-xs truncate" style={{ color: GOLD }}>{myProfile.trade ?? "No trade set"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4" style={{ color: GOLD }} />
                </div>
              </Link>
            ) : (
              <div>
                <p className="text-sm font-medium mb-2 text-white">Complete your profile</p>
                <p className="text-xs mb-3" style={{ color: GOLD }}>Set up your TradeHub profile to connect with contractors.</p>
                <Link href="/tradehub/profile/me">
                  <Button size="sm" className="w-full" style={{ background: GOLD, color: BLACK }}>Set Up Profile</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Nav */}
          <div className="rounded-xl p-2 space-y-1" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            {[
              { href: "/tradehub", label: "Feed", icon: Globe },
              { href: "/tradehub/jobs", label: "Job Board", icon: Briefcase },
              { href: "/tradehub/messages", label: "Messages", icon: MessageCircle },
              { href: "/tradehub/profile/me", label: "My Profile", icon: User },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: "#d4d4d4" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GOLD; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#d4d4d4"; }}>
                  <Icon className="h-4 w-4" style={{ color: GOLD }} />{label}
                </button>
              </Link>
            ))}
          </div>

          {/* Filters */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Filter Feed</p>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="text-sm border-0" style={{ background: "#1f1f1f", color: "white" }}>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="discussion">Discussions</SelectItem>
                <SelectItem value="job">Jobs</SelectItem>
                <SelectItem value="showcase">Showcases</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tradeFilter} onValueChange={setTradeFilter}>
              <SelectTrigger className="text-sm border-0" style={{ background: "#1f1f1f", color: "white" }}>
                <SelectValue placeholder="All trades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trades</SelectItem>
                {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={provinceFilter} onValueChange={setProvinceFilter}>
              <SelectTrigger className="text-sm border-0" style={{ background: "#1f1f1f", color: "white" }}>
                <SelectValue placeholder="All provinces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Provinces</SelectItem>
                {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            {(typeFilter !== "all" || tradeFilter !== "all" || provinceFilter !== "all") && (
              <button className="w-full text-xs py-1.5 rounded-lg transition-colors"
                style={{ color: GOLD, background: "#1f1f1f" }}
                onClick={() => { setTypeFilter("all"); setTradeFilter("all"); setProvinceFilter("all"); }}>
                <X className="h-3 w-3 mr-1 inline" />Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Feed */}
        <div className="lg:col-span-3 space-y-4">
          {isLoading ? (
            [1,2,3].map((i) => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
                <Globe className="h-12 w-12 text-muted-foreground/30" />
                <div className="text-center">
                  <p className="font-semibold text-foreground">No posts yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Be the first to post something on TradeHub.</p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="gap-2">
                  <Plus className="h-4 w-4" />Create First Post
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onReact={(id) => reactMutation.mutate(id)} />
              ))}
              {hasNextPage && (
                <Button variant="outline" className="w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load More
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <CreatePostModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
