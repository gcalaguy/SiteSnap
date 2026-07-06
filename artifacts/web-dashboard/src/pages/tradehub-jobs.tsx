import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  listTradehubJobs,
  getListTradehubJobsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Briefcase, MapPin, DollarSign, Clock, Loader2, ArrowLeft, Filter, X, Zap, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignedAvatar } from "@/components/SignedAvatar";

const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
const GOLD = "#C9A84C";
const BLACK = "#111111";

const LOGO_COLORS = ["#1d4ed8", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#0369a1"];
function logoColorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

export default function TradehubJobsPage() {
  const [tradeFilter, setTradeFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");

  const jobParams = {
    ...(tradeFilter !== "all" ? { trade: tradeFilter } : {}),
    ...(provinceFilter !== "all" ? { province: provinceFilter } : {}),
  };

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: getListTradehubJobsQueryKey(jobParams),
    queryFn: ({ pageParam = 1 }) => listTradehubJobs({ ...jobParams, page: pageParam as number }),
    getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const jobs = data?.pages.flatMap((p) => p.posts) ?? [];
  const [, navigate] = useLocation();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tradehub">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: BLACK }}>
            <Briefcase className="h-5 w-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Job Board</h1>
            <p className="text-sm text-muted-foreground">Construction jobs across Canada</p>
          </div>
        </div>
        <Link href="/tradehub">
          <Button className="gap-2 text-sm font-semibold" style={{ background: BLACK, color: GOLD }}>
            <Briefcase className="h-4 w-4" />Post a Job
          </Button>
        </Link>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="All trades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={provinceFilter} onValueChange={setProvinceFilter}>
          <SelectTrigger className="w-[160px]">
            <MapPin className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="All provinces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Provinces</SelectItem>
            {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {(tradeFilter !== "all" || provinceFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setTradeFilter("all"); setProvinceFilter("all"); }}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground flex items-center">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} found
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
            <Briefcase className="h-12 w-12 text-muted-foreground/30" />
            <div className="text-center">
              <p className="font-semibold">No jobs posted yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {tradeFilter !== "all" || provinceFilter !== "all"
                  ? "Try adjusting your filters."
                  : "Be the first to post a job on TradeHub."}
              </p>
            </div>
            <Link href="/tradehub">
              <Button>Post a Job</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const authorName = job.profile?.displayName ?? `${job.author?.firstName ?? ""} ${job.author?.lastName ?? ""}`.trim();
            const initials = authorName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            const logoColor = logoColorFor(authorName || String(job.id));

            return (
              <Card key={job.id}
                className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all overflow-hidden"
                onClick={() => navigate(`/tradehub/posts/${job.id}`)}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Company logo placeholder */}
                    <div className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 relative" style={{ background: `${logoColor}18`, border: `1px solid ${logoColor}33` }}>
                      <SignedAvatar
                        url={job.profile?.avatarUrl}
                        sizeClass="w-14 h-14"
                        fallback={<span className="font-bold text-sm" style={{ color: logoColor }}>{initials || <Building2 className="h-5 w-5" style={{ color: logoColor }} />}</span>}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground text-base mb-0.5 hover:text-primary transition-colors leading-snug">
                            {job.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {authorName}
                            {job.profile?.isVerified && (
                              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">✓</span>
                            )}
                          </p>
                        </div>
                        {job.budget && (
                          <span className="flex-shrink-0 flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full" style={{ background: `${GOLD}20`, color: "#8a6d1f" }}>
                            <DollarSign className="h-3.5 w-3.5" />{job.budget}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 my-2.5">{job.content}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {job.trade && (
                          <Badge variant="outline" className="text-xs gap-1"><Briefcase className="h-3 w-3" />{job.trade}</Badge>
                        )}
                        {(job.location || job.province) && (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                            <MapPin className="h-3 w-3" />{[job.location, job.province].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {job.jobType && (
                          <Badge variant="outline" className="text-xs">{job.jobType}</Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(job.createdAt), "MMM d")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                    <span className="text-xs text-muted-foreground">
                      {job.applicationCount > 0 ? `${job.applicationCount} applicant${job.applicationCount !== 1 ? "s" : ""}` : "Be the first to apply"}
                    </span>
                    <Button
                      size="sm"
                      className="gap-1.5 font-semibold shadow-sm"
                      style={{ background: BLACK, color: GOLD }}
                      onClick={(e) => { e.stopPropagation(); navigate(`/tradehub/posts/${job.id}`); }}
                    >
                      <Zap className="h-3.5 w-3.5" />Quick Apply
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {hasNextPage && (
            <Button variant="outline" className="w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Load More Jobs
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
