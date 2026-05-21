import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Globe, Plus, ThumbsUp, MessageSquare, Briefcase, Search, Bell, User,
  ChevronRight, X, Send, Loader2, Sparkles, MessageCircle, MapPin, BadgeCheck,
  ArrowUp, ArrowDown, ArrowUpDown, Clock, DollarSign, Calendar, ShieldAlert,
  CheckCircle2, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

interface JobPosting {
  id: number; projectTitle: string; description: string;
  scopeOfWork: string | null; budgetEstimate: string | null;
  targetedStartDate: string | null; location: string | null; province: string | null;
  trade: string | null; companyName: string; posterName: string;
  applicationCount: number; hasApplied: boolean; status: string;
  createdAt: string;
}

interface ForumPost {
  id: number; userId: number; title: string; content: string;
  trade: string | null; province: string | null; createdAt: string;
  commentCount: number; reactionCount: number; hasReacted: boolean;
  author: { id: number; firstName: string; lastName: string } | null;
  profile: { displayName: string; trade: string | null; isVerified: boolean; avatarUrl: string | null } | null;
}

function Avatar({ profile, author, size = 10 }: { profile: Post["profile"]; author: Post["author"]; size?: number }) {
  const initials = profile?.displayName
    ? profile.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : author ? `${author.firstName[0]}${author.lastName[0]}` : "??";
  const sz = `w-${size} h-${size}`;
  if (profile?.avatarUrl) {
    return <img src={profile.avatarUrl} className={`${sz} rounded-full object-cover flex-shrink-0`} alt="" />;
  }
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0`}
      style={{ background: GOLD, color: BLACK }}>{initials}</div>
  );
}

function FeedPostCard({ post, onReact }: { post: Post; onReact: (id: number) => void }) {
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
                  <span className="text-sm font-semibold text-foreground hover:underline leading-tight">{displayName}</span>
                  {post.profile?.isVerified && <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#3b82f6" }} />}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {post.profile?.trade && <span className="text-xs text-muted-foreground">{post.profile.trade}</span>}
                  {post.province && <><span className="text-muted-foreground/40 text-xs">·</span><span className="flex items-center gap-0.5 text-xs text-muted-foreground"><MapPin className="h-2.5 w-2.5" />{post.province}</span></>}
                </div>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: `${tc.accent}18`, color: tc.accent }}><Icon className="h-3 w-3" />{tc.label}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(post.createdAt), "MMM d")}</span>
          </div>
        </div>
        <Link href={`/tradehub/posts/${post.id}`}>
          <div className="cursor-pointer mb-3">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1 leading-snug">{post.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{post.content}</p>
          </div>
        </Link>
        {post.type === "job" && (post.budget || post.jobType) && (
          <div className="flex gap-2 flex-wrap mb-3">
            {post.jobType && <span className="text-xs border border-border rounded-full px-2.5 py-0.5 text-muted-foreground">{post.jobType}</span>}
            {post.budget && <span className="text-xs rounded-full px-2.5 py-0.5 font-semibold" style={{ background: `${GOLD}20`, color: GOLD }}>{post.budget}</span>}
          </div>
        )}
        {post.media.length > 0 && (
          <div className={`mb-3 grid gap-1.5 rounded-lg overflow-hidden ${post.media.length === 1 ? "" : "grid-cols-2"}`}>
            {post.media.slice(0, 4).map((m) => <img key={m.id} src={m.url} className="object-cover w-full aspect-video" alt="" />)}
          </div>
        )}
        <div className="flex items-center gap-1 pt-3 border-t border-border/40">
          <button onClick={() => onReact(post.id)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${post.hasReacted ? "font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            style={post.hasReacted ? { color: GOLD, background: `${GOLD}15` } : undefined}>
            <ThumbsUp className={`h-3.5 w-3.5 ${post.hasReacted ? "fill-current" : ""}`} />{post.reactionCount > 0 ? post.reactionCount : "Like"}
          </button>
          <Link href={`/tradehub/posts/${post.id}`}>
            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <MessageSquare className="h-3.5 w-3.5" />{post.commentCount > 0 ? post.commentCount : "Comment"}
            </button>
          </Link>
          {post.type === "job" && (
            <Link href={`/tradehub/posts/${post.id}`} className="ml-auto">
              <button className="text-xs px-4 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
                style={post.applicationCount > 0 ? { background: `${GOLD}20`, color: GOLD } : { background: BLACK, color: GOLD }}>
                {post.applicationCount > 0 ? `${post.applicationCount} Applied` : "Apply Now"}
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ForumPostCard({ post, onReact }: { post: ForumPost; onReact: (id: number) => void }) {
  const displayName = post.profile?.displayName ?? `${post.author?.firstName} ${post.author?.lastName}`;
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden hover:border-border hover:shadow-sm transition-all">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <Link href={`/tradehub/profile/${post.userId}`}>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <Avatar profile={post.profile} author={post.author} size={9} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground hover:underline leading-tight">{displayName}</span>
                  {post.profile?.isVerified && <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#3b82f6" }} />}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {post.profile?.trade && <span className="text-xs text-muted-foreground">{post.profile.trade}</span>}
                  {post.province && <><span className="text-muted-foreground/40 text-xs">·</span><span className="flex items-center gap-0.5 text-xs text-muted-foreground"><MapPin className="h-2.5 w-2.5" />{post.province}</span></>}
                </div>
              </div>
            </div>
          </Link>
          <span className="text-xs text-muted-foreground">{format(new Date(post.createdAt), "MMM d")}</span>
        </div>
        <Link href={`/tradehub/posts/${post.id}`}>
          <div className="cursor-pointer mb-3">
            <h3 className="font-semibold text-foreground hover:text-primary transition-colors mb-1 leading-snug">{post.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{post.content}</p>
          </div>
        </Link>
        <div className="flex items-center gap-3 pt-3 border-t border-border/40">
          <div className="flex items-center bg-muted rounded-lg overflow-hidden">
            <button onClick={() => onReact(post.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${post.hasReacted ? "font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              style={post.hasReacted ? { color: "#ea580c", background: "#ea580c15" } : undefined}>
              <ArrowUp className="h-3.5 w-3.5" />
              {post.reactionCount > 0 ? post.reactionCount : "Upvote"}
            </button>
          </div>
          <Link href={`/tradehub/posts/${post.id}`}>
            <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <MessageSquare className="h-3.5 w-3.5" />{post.commentCount > 0 ? `${post.commentCount} comments` : "Reply"}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TenderCard({
  tender,
  myProfile,
  onApply,
}: {
  tender: JobPosting;
  myProfile: any;
  onApply: (id: number, msg: string) => void;
}) {
  const isNonCompliant = myProfile?.complianceStatus === "non_compliant";
  const isWarning = myProfile?.complianceStatus === "warning";
  const compliance = myProfile?.complianceStatus ?? "compliant";
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");

  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden hover:border-border hover:shadow-md transition-all">
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground leading-snug">{tender.projectTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Posted by {tender.companyName} · {tender.posterName}</p>
          </div>
          <Badge variant="outline" className="flex-shrink-0">
            {tender.trade ?? "Any trade"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{tender.description}</p>
        {tender.scopeOfWork && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium mb-1 text-foreground">Scope of Work</p>
            <p className="text-xs text-muted-foreground">{tender.scopeOfWork}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {tender.budgetEstimate && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              <DollarSign className="h-3 w-3" />{tender.budgetEstimate}
            </span>
          )}
          {tender.targetedStartDate && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              <Calendar className="h-3 w-3" />{format(new Date(tender.targetedStartDate), "MMM d, yyyy")}
            </span>
          )}
          {tender.province && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              <MapPin className="h-3 w-3" />{tender.province}{tender.location ? ` — ${tender.location}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border/40">
          <span className="text-xs text-muted-foreground">
            {tender.applicationCount > 0 ? `${tender.applicationCount} application${tender.applicationCount !== 1 ? "s" : ""}` : "Be the first to apply"}
          </span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  {tender.hasApplied ? (
                    <Badge variant="outline" className="gap-1.5 text-green-700 border-green-200 bg-green-50">
                      <CheckCircle2 className="h-3.5 w-3.5" />Applied
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-2"
                      disabled={isNonCompliant}
                      style={!isNonCompliant ? { background: BLACK, color: GOLD } : undefined}
                      onClick={() => setShowApplyDialog(true)}
                    >
                      <Briefcase className="h-3.5 w-3.5" />Apply for Subcontract
                    </Button>
                  )}
                </span>
              </TooltipTrigger>
              {isNonCompliant && (
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">You must update your liability insurance in settings to bid on projects.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Apply for Subcontract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Applying to: <strong>{tender.projectTitle}</strong></p>
            {isWarning && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">Your compliance status is "Warning". You can still apply, but the poster may review your insurance details.</p>
              </div>
            )}
            <div>
              <Label>Cover Message (optional)</Label>
              <Textarea value={applyMsg} onChange={(e) => setApplyMsg(e.target.value)} placeholder="Introduce your company and relevant experience…" rows={4} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
            <Button onClick={() => { onApply(tender.id, applyMsg); setShowApplyDialog(false); setApplyMsg(""); }} disabled={!applyMsg.trim()}
              className="gap-2" style={{ background: BLACK, color: GOLD }}>
              <Send className="h-4 w-4" />Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const createMutation = useMutation({
    mutationFn: () => customFetch("/api/tradehub/posts", {
      method: "POST",
      body: JSON.stringify({ type, title, content, trade: trade || undefined, province: province || undefined, budget: budget || undefined, jobType: jobType || undefined }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-feed"] });
      queryClient.invalidateQueries({ queryKey: ["tradehub-forum"] });
      toast({ title: "Post published to TradeHub!" });
      onClose();
      setTitle(""); setContent(""); setType("discussion");
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed to post", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New TradeHub Post</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["discussion", "job", "showcase"] as const).map((t) => {
              const cfg = typeConfig[t];
              const Ic = cfg.icon;
              const isActive = type === t;
              return (
                <button key={t} onClick={() => setType(t)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all"
                  style={isActive ? { borderColor: cfg.accent, background: `${cfg.accent}12`, color: cfg.accent } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
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
              <div><Label>Budget / Rate</Label><Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. $75/hr or $5,000" className="mt-1" /></div>
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
          <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || !content.trim() || createMutation.isPending}
            className="gap-2" style={{ background: BLACK, color: GOLD }}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTenderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [budgetEstimate, setBudgetEstimate] = useState("");
  const [targetedStartDate, setTargetedStartDate] = useState("");
  const [location, setLocation] = useState("");
  const [province, setProvince] = useState("");
  const [trade, setTrade] = useState("");

  const createMutation = useMutation({
    mutationFn: () => customFetch("/api/tradehub/job-postings", {
      method: "POST",
      body: JSON.stringify({ projectTitle, description, scopeOfWork: scopeOfWork || undefined, budgetEstimate: budgetEstimate || undefined, targetedStartDate: targetedStartDate || undefined, location: location || undefined, province: province || undefined, trade: trade || undefined }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-tenders"] });
      toast({ title: "Tender posted!" });
      onClose();
      setProjectTitle(""); setDescription(""); setScopeOfWork(""); setBudgetEstimate(""); setTargetedStartDate(""); setLocation(""); setProvince(""); setTrade("");
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed to post tender", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Post an Open Tender</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Project Title *</Label><Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="e.g. Commercial Renovation — Calgary Downtown" className="mt-1" /></div>
          <div><Label>Description *</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Overview of the project, site access, and general requirements…" className="mt-1" /></div>
          <div><Label>Scope of Work</Label><Textarea value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} rows={2} placeholder="Specific tasks, deliverables, and responsibilities…" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Budget Estimate</Label><Input value={budgetEstimate} onChange={(e) => setBudgetEstimate(e.target.value)} placeholder="e.g. $15,000–$25,000" className="mt-1" /></div>
            <div><Label>Targeted Start Date</Label><Input type="date" value={targetedStartDate} onChange={(e) => setTargetedStartDate(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City / Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Calgary" className="mt-1" /></div>
            <div>
              <Label>Province</Label>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select province" /></SelectTrigger>
                <SelectContent>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Targeted Trade</Label>
            <Select value={trade} onValueChange={setTrade}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Any trade" /></SelectTrigger>
              <SelectContent>{TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!projectTitle.trim() || !description.trim() || createMutation.isPending}
            className="gap-2" style={{ background: BLACK, color: GOLD }}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Post Tender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TradehubPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [activeTab, setActiveTab] = useState<"feed" | "forums" | "tenders">("feed");
  const [showCreate, setShowCreate] = useState(false);
  const [showTenderCreate, setShowTenderCreate] = useState(false);

  const { data: notifications = [] } = useQuery<any[]>({ queryKey: ["tradehub-notifications"], queryFn: () => customFetch("/api/tradehub/notifications") });
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;
  const { data: myProfile } = useQuery<any>({ queryKey: ["tradehub-profile-me"], queryFn: () => customFetch("/api/tradehub/profile/me") });

  // ── Marketplace Feed state ──
  const [feedType, setFeedType] = useState("all");
  const [feedTrade, setFeedTrade] = useState("all");
  const [feedProvince, setFeedProvince] = useState("all");
  const [feedSearch, setFeedSearch] = useState("");

  const feedParams = new URLSearchParams();
  if (feedType !== "all") feedParams.set("type", feedType);
  if (feedTrade !== "all") feedParams.set("trade", feedTrade);
  if (feedProvince !== "all") feedParams.set("province", feedProvince);

  const feedQuery = useInfiniteQuery({
    queryKey: ["tradehub-feed", feedType, feedTrade, feedProvince],
    queryFn: ({ pageParam = 1 }) => customFetch(`/api/tradehub/feed?${feedParams.toString()}&page=${pageParam}`),
    getNextPageParam: (last: any) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const reactMutation = useMutation({
    mutationFn: (postId: number) => customFetch(`/api/tradehub/posts/${postId}/react`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-feed"] });
      queryClient.invalidateQueries({ queryKey: ["tradehub-forum"] });
    },
  });

  const allFeedPosts: Post[] = feedQuery.data?.pages.flatMap((p: any) => p.posts) ?? [];
  const feedPosts = feedSearch.trim()
    ? allFeedPosts.filter((p) => p.title.toLowerCase().includes(feedSearch.toLowerCase()) || p.content.toLowerCase().includes(feedSearch.toLowerCase()))
    : allFeedPosts;

  // ── Trade Forums state ──
  const [forumSearch, setForumSearch] = useState("");
  const [forumSort, setForumSort] = useState<"new" | "top">("new");
  const forumParams = new URLSearchParams();
  forumParams.set("type", "discussion");
  if (forumSort === "top") forumParams.set("sort", "top");

  const forumQuery = useInfiniteQuery({
    queryKey: ["tradehub-forum", forumSort],
    queryFn: ({ pageParam = 1 }) => customFetch(`/api/tradehub/feed?${forumParams.toString()}&page=${pageParam}`),
    getNextPageParam: (last: any) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const allForumPosts: ForumPost[] = forumQuery.data?.pages.flatMap((p: any) => p.posts) ?? [];
  const forumPosts = forumSearch.trim()
    ? allForumPosts.filter((p) => p.title.toLowerCase().includes(forumSearch.toLowerCase()) || p.content.toLowerCase().includes(forumSearch.toLowerCase()))
    : allForumPosts;

  // ── Open Tenders state ──
  const [tenderSearch, setTenderSearch] = useState("");
  const [tenderTrade, setTenderTrade] = useState("all");
  const [tenderProvince, setTenderProvince] = useState("all");

  const tenderParams = new URLSearchParams();
  if (tenderTrade !== "all") tenderParams.set("trade", tenderTrade);
  if (tenderProvince !== "all") tenderParams.set("province", tenderProvince);
  if (tenderSearch.trim()) tenderParams.set("search", tenderSearch.trim());

  const { data: tenders = [], isLoading: tendersLoading } = useQuery<JobPosting[]>({
    queryKey: ["tradehub-tenders", tenderTrade, tenderProvince, tenderSearch],
    queryFn: () => customFetch(`/api/tradehub/job-postings?${tenderParams.toString()}`),
  });

  const applyMutation = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      customFetch(`/api/tradehub/job-postings/${id}/apply`, { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tradehub-tenders"] });
      toast({ title: "Application sent!", description: "The poster will be notified." });
    },
    onError: (err: any) => {
      if (err?.code === "COMPLIANCE_ERROR") {
        toast({ title: "Compliance required", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: err?.message ?? "Failed to apply", variant: "destructive" });
      }
    },
  });

  const tabs = [
    { id: "feed" as const, label: "Marketplace Feed", icon: Globe },
    { id: "forums" as const, label: "Trade Forums", icon: MessageSquare },
    { id: "tenders" as const, label: "Open Tenders", icon: Briefcase },
  ];

  const hasFeedFilters = feedTrade !== "all" || feedProvince !== "all";
  const hasTenderFilters = tenderTrade !== "all" || tenderProvince !== "all";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: BLACK }}>
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
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ background: GOLD, color: BLACK }}>{unreadCount}</span>
              )}
            </Button>
          </Link>
          <Link href="/tradehub/profile/me">
            <Button variant="outline" size="icon" className="h-9 w-9"><User className="h-4 w-4" /></Button>
          </Link>
          <Button className="gap-2 h-9 font-semibold" style={{ background: BLACK, color: GOLD }} onClick={() => activeTab === "tenders" ? setShowTenderCreate(true) : setShowCreate(true)}>
            <Plus className="h-4 w-4" />{activeTab === "tenders" ? "Post Tender" : "Post"}
          </Button>
        </div>
      </div>

      {/* 3-Way Tabs */}
      <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: BLACK }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${isActive ? "font-semibold" : "text-zinc-400 hover:text-zinc-200"}`}
              style={isActive ? { background: GOLD, color: BLACK } : undefined}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <aside className="lg:col-span-1 space-y-3">
          <div className="rounded-xl p-4" style={{ background: BLACK }}>
            {myProfile ? (
              <Link href="/tradehub/profile/me">
                <div className="flex items-center gap-3 cursor-pointer group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: GOLD, color: BLACK }}>
                    {myProfile.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-white leading-tight">{myProfile.displayName}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: GOLD }}>{myProfile.trade ?? "No trade set"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
                </div>
              </Link>
            ) : (
              <div>
                <p className="text-sm font-semibold mb-1 text-white">Complete your profile</p>
                <p className="text-xs mb-3 leading-relaxed" style={{ color: "#a1a1aa" }}>Set up your TradeHub profile to connect with Canadian contractors.</p>
                <Link href="/tradehub/profile/me">
                  <Button size="sm" className="w-full font-semibold" style={{ background: GOLD, color: BLACK }}>Set Up Profile</Button>
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-xl py-2" style={{ background: BLACK }}>
            {[
              { href: "/tradehub", label: "Feed", icon: Globe },
              { href: "/tradehub/jobs", label: "Job Board", icon: Briefcase },
              { href: "/tradehub/messages", label: "Messages", icon: MessageCircle },
              { href: "/tradehub/profile/me", label: "My Profile", icon: User },
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

          {/* Contextual sidebar filters */}
          {activeTab === "feed" && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: BLACK }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Refine Feed</p>
              <Select value={feedTrade} onValueChange={setFeedTrade}>
                <SelectTrigger className="text-sm border-0 h-9" style={{ background: "#1f1f1f", color: "white" }}><SelectValue placeholder="All trades" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Trades</SelectItem>{TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={feedProvince} onValueChange={setFeedProvince}>
                <SelectTrigger className="text-sm border-0 h-9" style={{ background: "#1f1f1f", color: "white" }}><SelectValue placeholder="All provinces" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Provinces</SelectItem>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              {hasFeedFilters && (
                <button className="w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors" style={{ color: GOLD, background: "#1f1f1f" }}
                  onClick={() => { setFeedTrade("all"); setFeedProvince("all"); }}><X className="h-3 w-3" />Clear Filters</button>
              )}
            </div>
          )}

          {activeTab === "forums" && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: BLACK }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Sort Discussions</p>
              <div className="flex rounded-lg overflow-hidden" style={{ background: "#1f1f1f" }}>
                <button onClick={() => setForumSort("new")} className={`flex-1 py-1.5 text-xs font-medium transition-colors ${forumSort === "new" ? "" : "text-zinc-500"}`}
                  style={forumSort === "new" ? { background: GOLD, color: BLACK } : undefined}><Clock className="h-3 w-3 inline mr-1" />New</button>
                <button onClick={() => setForumSort("top")} className={`flex-1 py-1.5 text-xs font-medium transition-colors ${forumSort === "top" ? "" : "text-zinc-500"}`}
                  style={forumSort === "top" ? { background: GOLD, color: BLACK } : undefined}><ArrowUpDown className="h-3 w-3 inline mr-1" />Top</button>
              </div>
            </div>
          )}

          {activeTab === "tenders" && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: BLACK }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Refine Tenders</p>
              <Select value={tenderTrade} onValueChange={setTenderTrade}>
                <SelectTrigger className="text-sm border-0 h-9" style={{ background: "#1f1f1f", color: "white" }}><SelectValue placeholder="All trades" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Trades</SelectItem>{TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={tenderProvince} onValueChange={setTenderProvince}>
                <SelectTrigger className="text-sm border-0 h-9" style={{ background: "#1f1f1f", color: "white" }}><SelectValue placeholder="All provinces" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Provinces</SelectItem>{PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              {hasTenderFilters && (
                <button className="w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors" style={{ color: GOLD, background: "#1f1f1f" }}
                  onClick={() => { setTenderTrade("all"); setTenderProvince("all"); }}><X className="h-3 w-3" />Clear Filters</button>
              )}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* ── Marketplace Feed ── */}
          {activeTab === "feed" && (
            <>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input value={feedSearch} onChange={(e) => setFeedSearch(e.target.value)} placeholder="Search posts…" className="pl-9 h-10" />
                  {feedSearch && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setFeedSearch("")}><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: BLACK }}>
                  {[{ value: "all", label: "All" }, { value: "job", label: "Jobs" }, { value: "discussion", label: "Discussions" }, { value: "showcase", label: "Showcases" }].map((tab) => {
                    const isActive = feedType === tab.value;
                    return (
                      <button key={tab.value} onClick={() => setFeedType(tab.value)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${isActive ? "font-semibold" : "text-zinc-400 hover:text-zinc-200"}`}
                        style={isActive ? { background: GOLD, color: BLACK } : undefined}>{tab.label}</button>
                    );
                  })}
                </div>
              </div>
              {feedQuery.isLoading ? [1,2,3].map((i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)
                : feedPosts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl border border-border/60 bg-card">
                    <Globe className="h-12 w-12 text-muted-foreground/20" />
                    <div className="text-center"><p className="font-semibold">No posts found</p><p className="text-sm text-muted-foreground mt-1">{feedSearch ? "Try a different search term." : "Be the first to post something on TradeHub."}</p></div>
                    {!feedSearch && <Button className="gap-2" style={{ background: BLACK, color: GOLD }} onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Create First Post</Button>}
                  </div>
                ) : (
                  <>
                    {feedPosts.map((post) => <FeedPostCard key={post.id} post={post} onReact={(id) => reactMutation.mutate(id)} />)}
                    {feedQuery.hasNextPage && <Button variant="outline" className="w-full" onClick={() => feedQuery.fetchNextPage()} disabled={feedQuery.isFetchingNextPage}>
                      {feedQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Load More</Button>}
                  </>
                )}
            </>
          )}

          {/* ── Trade Forums ── */}
          {activeTab === "forums" && (
            <>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input value={forumSearch} onChange={(e) => setForumSearch(e.target.value)} placeholder="Search discussions, code questions, announcements…" className="pl-9 h-10" />
                  {forumSearch && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setForumSearch("")}><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{forumPosts.length} discussion{forumPosts.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              {forumQuery.isLoading ? [1,2,3].map((i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)
                : forumPosts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl border border-border/60 bg-card">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/20" />
                    <div className="text-center"><p className="font-semibold">No discussions yet</p><p className="text-sm text-muted-foreground mt-1">{forumSearch ? "Try a different search term." : "Start a conversation about building codes, materials, or safety."}</p></div>
                    {!forumSearch && <Button className="gap-2" style={{ background: BLACK, color: GOLD }} onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Start Discussion</Button>}
                  </div>
                ) : (
                  <>
                    {forumPosts.map((post) => <ForumPostCard key={post.id} post={post} onReact={(id) => reactMutation.mutate(id)} />)}
                    {forumQuery.hasNextPage && <Button variant="outline" className="w-full" onClick={() => forumQuery.fetchNextPage()} disabled={forumQuery.isFetchingNextPage}>
                      {forumQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Load More</Button>}
                  </>
                )}
            </>
          )}

          {/* ── Open Tenders ── */}
          {activeTab === "tenders" && (
            <>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input value={tenderSearch} onChange={(e) => setTenderSearch(e.target.value)} placeholder="Search tenders by title or keyword…" className="pl-9 h-10" />
                  {tenderSearch && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setTenderSearch("")}><X className="h-3.5 w-3.5" /></button>}
                </div>
                {myProfile?.complianceStatus === "non_compliant" && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Compliance Required</p>
                      <p className="text-xs text-red-700">Your profile is marked non-compliant. You cannot bid on tenders until you update your liability insurance in your TradeHub profile settings.</p>
                    </div>
                  </div>
                )}
                {myProfile?.complianceStatus === "warning" && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Compliance Warning</p>
                      <p className="text-xs text-amber-700">Your insurance may be expiring soon. You can still bid, but review your coverage before committing to a project.</p>
                    </div>
                  </div>
                )}
              </div>
              {tendersLoading ? [1,2,3].map((i) => <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />)
                : tenders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl border border-border/60 bg-card">
                    <Briefcase className="h-12 w-12 text-muted-foreground/20" />
                    <div className="text-center"><p className="font-semibold">No open tenders</p><p className="text-sm text-muted-foreground mt-1">{tenderSearch ? "Try a different search term." : "Post the first tender and attract qualified subcontractors."}</p></div>
                    {!tenderSearch && <Button className="gap-2" style={{ background: BLACK, color: GOLD }} onClick={() => setShowTenderCreate(true)}><Plus className="h-4 w-4" />Post Tender</Button>}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tenders.map((tender) => (
                      <TenderCard key={tender.id} tender={tender} myProfile={myProfile} onApply={(id, msg) => applyMutation.mutate({ id, message: msg })} />
                    ))}
                  </div>
                )}
            </>
          )}
        </div>
      </div>

      <CreatePostModal open={showCreate} onClose={() => setShowCreate(false)} />
      <CreateTenderModal open={showTenderCreate} onClose={() => setShowTenderCreate(false)} />
    </div>
  );
}
