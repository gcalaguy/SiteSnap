import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  useListTradehubNotifications,
  useGetTradehubProfileMe,
  useReactToTradehubPost,
  useCreateTradehubPost,
  listTradehubFeed,
  getListTradehubFeedQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Globe, Plus, ThumbsUp, MessageSquare, Briefcase,
  Search, Bell, User, ChevronRight, X, Send, Loader2,
  Sparkles, MessageCircle, MapPin, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { DraftBanner } from "@/components/DraftBanner";
import { SignedAvatar } from "@/components/SignedAvatar";
import { SignedImage } from "@/components/SignedImage";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

const typeConfig: Record<string, { label: string; accent: string; icon: React.ElementType }> = {
  discussion: { label: "Discussion", accent: "#3b82f6", icon: MessageSquare },
  job:        { label: "Job",        accent: GOLD,      icon: Briefcase },
  showcase:   { label: "Showcase",   accent: "#a855f7", icon: Sparkles },
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

function Avatar({ profile, author, size = 10 }: { profile: Post["profile"]; author: Post["author"]; size?: number }) {
  const initials = profile?.displayName
    ? profile.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : author ? `${author.firstName[0]}${author.lastName[0]}` : "??";
  const sz = `w-${size} h-${size}`;
  return (
    <SignedAvatar
      url={profile?.avatarUrl}
      sizeClass={sz}
      initials={initials}
      style={{ background: GOLD, color: BLACK }}
    />
  );
}

function PostCard({ post, onReact }: { post: Post; onReact: (id: number) => void }) {
  const tc = typeConfig[post.type] ?? typeConfig.discussion;
  const Icon = tc.icon;
  const displayName = post.profile?.displayName ?? `${post.author?.firstName} ${post.author?.lastName}`;

  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden hover:border-border hover:shadow-md transition-all group"
      style={{ borderLeft: `3px solid ${tc.accent}` }}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <Link href={`/tradehub/profile/${post.userId}`}>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <Avatar profile={post.profile} author={post.author} size={9} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground hover:underline leading-tight">
                    {displayName}
                  </span>
                  {post.profile?.isVerified && (
                    <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {post.profile?.trade && (
                    <span className="text-xs text-muted-foreground">{post.profile.trade}</span>
                  )}
                  {post.province && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5" />{post.province}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: `${tc.accent}18`, color: tc.accent }}>
              <Icon className="h-3 w-3" />{tc.label}
            </span>
            <span className="text-xs text-muted-foreground">{format(new Date(post.createdAt), "MMM d")}</span>
          </div>
        </div>

        <Link href={`/tradehub/posts/${post.id}`}>
          <div className="cursor-pointer mb-3">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1 leading-snug">
              {post.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{post.content}</p>
          </div>
        </Link>

        {post.type === "job" && (post.budget || post.jobType) && (
          <div className="flex gap-2 flex-wrap mb-3">
            {post.jobType && (
              <span className="text-xs border border-border rounded-full px-2.5 py-0.5 text-muted-foreground">
                {post.jobType}
              </span>
            )}
            {post.budget && (
              <span className="text-xs rounded-full px-2.5 py-0.5 font-semibold"
                style={{ background: `${GOLD}20`, color: GOLD }}>
                {post.budget}
              </span>
            )}
          </div>
        )}

        {post.media.length > 0 && (
          <div className={`mb-3 grid gap-1.5 rounded-lg overflow-hidden ${post.media.length === 1 ? "" : "grid-cols-2"}`}>
            {post.media.slice(0, 4).map((m) => (
              <SignedImage key={m.id} src={m.url} alt="" className="object-cover w-full aspect-video" />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 pt-3 border-t border-border/40">
          <button
            onClick={() => onReact(post.id)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              post.hasReacted
                ? "font-semibold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            style={post.hasReacted ? { color: GOLD, background: `${GOLD}15` } : undefined}
          >
            <ThumbsUp className={`h-3.5 w-3.5 ${post.hasReacted ? "fill-current" : ""}`} />
            {post.reactionCount > 0 ? post.reactionCount : "Like"}
          </button>
          <Link href={`/tradehub/posts/${post.id}`}>
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <MessageSquare className="h-3.5 w-3.5" />
              {post.commentCount > 0 ? post.commentCount : "Comment"}
            </button>
          </Link>
          {post.type === "job" && (
            <Link href={`/tradehub/posts/${post.id}`} className="ml-auto">
              <button
                className="text-xs px-4 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
                style={
                  post.applicationCount > 0
                    ? { background: `${GOLD}20`, color: GOLD }
                    : { background: BLACK, color: GOLD }
                }
              >
                {post.applicationCount > 0 ? `${post.applicationCount} Applied` : "Apply Now"}
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatePostModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState("discussion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [trade, setTrade] = useState("");
  const [province, setProvince] = useState("");
  const [budget, setBudget] = useState("");
  const [jobType, setJobType] = useState("");

  const draft = useDraftRecovery(
    "tradehub-feed-post",
    () => ({ type, title, content, trade, province, budget, jobType }),
    (state) => {
      setType((state.type as string) || "discussion");
      setTitle((state.title as string) || "");
      setContent((state.content as string) || "");
      setTrade((state.trade as string) || "");
      setProvince((state.province as string) || "");
      setBudget((state.budget as string) || "");
      setJobType((state.jobType as string) || "");
    }
  );

  const createMutation = useCreateTradehubPost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradehubFeedQueryKey() });
        toast({ title: "Post published to TradeHub!" });
        draft.clearDraft();
        onClose();
        setTitle(""); setContent(""); setType("discussion");
      },
      onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed to post", variant: "destructive" }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New TradeHub Post</DialogTitle>
        </DialogHeader>
        <DraftBanner show={draft.showBanner} onRestore={draft.restoreDraft} onDiscard={draft.discardDraft} />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["discussion", "job", "showcase"] as const).map((t) => {
              const cfg = typeConfig[t];
              const Ic = cfg.icon;
              const isActive = type === t;
              return (
                <button key={t} onClick={() => setType(t)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all"
                  style={isActive
                    ? { borderColor: cfg.accent, background: `${cfg.accent}12`, color: cfg.accent }
                    : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  <Ic className="h-4 w-4" />{cfg.label}
                </button>
              );
            })}
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "job" ? "e.g. Looking for Electrician — Toronto" : "e.g. Tips for concrete work in winter"}
              className="mt-1" />
          </div>
          <div>
            <Label>Details *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4}
              placeholder={type === "job" ? "Describe the job, requirements, timeline…" : "Share your experience, question, or project…"}
              className="mt-1" />
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
          <Button
            onClick={() => createMutation.mutate({
              data: {
                type: type as "discussion" | "job" | "showcase",
                title,
                content,
                ...(trade ? { trade } : {}),
                ...(province ? { province } : {}),
                ...(budget ? { budget } : {}),
                ...(jobType ? { jobType } : {}),
              },
            })}
            disabled={!title.trim() || !content.trim() || createMutation.isPending}
            className="gap-2" style={{ background: BLACK, color: GOLD }}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_TABS = [
  { value: "all",        label: "All" },
  { value: "job",        label: "Jobs" },
  { value: "discussion", label: "Discussions" },
  { value: "showcase",   label: "Showcases" },
];

export default function TradehubFeedPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [search, setSearch] = useState("");

  const feedParams = {
    ...(typeFilter !== "all" ? { type: typeFilter as "discussion" | "job" | "showcase" } : {}),
    ...(tradeFilter !== "all" ? { trade: tradeFilter } : {}),
    ...(provinceFilter !== "all" ? { province: provinceFilter } : {}),
  };

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: getListTradehubFeedQueryKey(feedParams),
    queryFn: ({ pageParam = 1 }) => listTradehubFeed({ ...feedParams, page: pageParam as number }),
    getNextPageParam: (last: any) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const { data: notifications = [] } = useListTradehubNotifications();
  const unreadCount = (notifications as any[]).filter((n: any) => !n.isRead).length;

  const { data: myProfile } = useGetTradehubProfileMe();

  const reactMutation = useReactToTradehubPost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTradehubFeedQueryKey() }),
      onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" }),
    },
  });

  const allPosts: Post[] = data?.pages.flatMap((p: any) => p.posts) ?? [];
  const posts = search.trim()
    ? allPosts.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.content.toLowerCase().includes(search.toLowerCase()))
    : allPosts;

  const hasFilters = tradeFilter !== "all" || provinceFilter !== "all";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: BLACK }}>
            <Globe className="h-5 w-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">TradeHub</h1>
            <p className="text-sm text-muted-foreground">Canada's construction trade network</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/tradehub/notifications">
            <Button variant="outline" size="icon" className="relative h-9 w-9">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold"
                  style={{ background: GOLD, color: BLACK }}>{unreadCount}</span>
              )}
            </Button>
          </Link>
          <Link href="/tradehub/profile/me">
            <Button variant="outline" size="icon" className="h-9 w-9"><User className="h-4 w-4" /></Button>
          </Link>
          <Button className="gap-2 h-9 font-semibold" style={{ background: BLACK, color: GOLD }}
            onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />Post
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-3">
          <div className="rounded-xl p-4" style={{ background: BLACK }}>
            {myProfile ? (
              <Link href="/tradehub/profile/me">
                <div className="flex items-center gap-3 cursor-pointer group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: GOLD, color: BLACK }}>
                    {(myProfile as any).displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-white leading-tight">{(myProfile as any).displayName}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: GOLD }}>{(myProfile as any).trade ?? "No trade set"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
                </div>
              </Link>
            ) : (
              <div>
                <p className="text-sm font-semibold mb-1 text-white">Complete your profile</p>
                <p className="text-xs mb-3 leading-relaxed" style={{ color: "#a1a1aa" }}>
                  Set up your TradeHub profile to connect with Canadian contractors.
                </p>
                <Link href="/tradehub/profile/me">
                  <Button size="sm" className="w-full font-semibold" style={{ background: GOLD, color: BLACK }}>
                    Set Up Profile
                  </Button>
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-xl py-2" style={{ background: BLACK }}>
            {[
              { href: "/tradehub",          label: "Feed",       icon: Globe },
              { href: "/tradehub/jobs",      label: "Job Board",  icon: Briefcase },
              { href: "/tradehub/messages",  label: "Messages",   icon: MessageCircle },
              { href: "/tradehub/profile/me",label: "My Profile", icon: User },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors rounded-lg mx-auto"
                  style={{ color: "#a1a1aa", width: "calc(100% - 8px)", marginLeft: 4 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GOLD; (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#a1a1aa"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                  <Icon className="h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />{label}
                </button>
              </Link>
            ))}
          </div>

          <div className="rounded-xl p-4 space-y-3" style={{ background: BLACK }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Refine</p>
            <Select value={tradeFilter} onValueChange={setTradeFilter}>
              <SelectTrigger className="text-sm border-0 h-9" style={{ background: "#1f1f1f", color: "white" }}>
                <SelectValue placeholder="All trades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trades</SelectItem>
                {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={provinceFilter} onValueChange={setProvinceFilter}>
              <SelectTrigger className="text-sm border-0 h-9" style={{ background: "#1f1f1f", color: "white" }}>
                <SelectValue placeholder="All provinces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Provinces</SelectItem>
                {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters && (
              <button
                className="w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                style={{ color: GOLD, background: "#1f1f1f" }}
                onClick={() => { setTradeFilter("all"); setProvinceFilter("all"); }}>
                <X className="h-3 w-3" />Clear Filters
              </button>
            )}
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search posts…"
                className="pl-9 h-10"
              />
              {search && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: BLACK }}>
              {TYPE_TABS.map((tab) => {
                const isActive = typeFilter === tab.value;
                return (
                  <button key={tab.value}
                    onClick={() => setTypeFilter(tab.value)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${isActive ? "font-semibold" : "text-zinc-400 hover:text-zinc-200"}`}
                    style={isActive ? { background: GOLD, color: BLACK } : {}}>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Globe className="h-10 w-10 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">No posts yet</p>
              <p className="text-sm text-muted-foreground">Be the first to share something with the TradeHub.</p>
              <Button className="mt-1 gap-2" style={{ background: BLACK, color: GOLD }}
                onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />Create Post
              </Button>
            </div>
          ) : (
            <>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onReact={(id) => reactMutation.mutate({ id })} />
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
