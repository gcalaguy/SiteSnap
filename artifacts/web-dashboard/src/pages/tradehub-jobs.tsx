import { useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Briefcase, MapPin, DollarSign, Clock, Loader2, ArrowLeft, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TRADES = ["Electrician","Plumber","HVAC","General Contractor","Carpenter","Welder","Roofer","Painter","Mason","Ironworker","Concrete","Landscaping","Other"];
const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

export default function TradehubJobsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tradeFilter, setTradeFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");

  const params = new URLSearchParams();
  if (tradeFilter !== "all") params.set("trade", tradeFilter);
  if (provinceFilter !== "all") params.set("province", provinceFilter);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["tradehub-jobs", tradeFilter, provinceFilter],
    queryFn: ({ pageParam = 1 }) =>
      customFetch(`/api/tradehub/jobs?${params.toString()}&page=${pageParam}`),
    getNextPageParam: (last: any) => last.hasMore ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const jobs: any[] = data?.pages.flatMap((p: any) => p.posts) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tradehub">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="p-2 bg-green-100 rounded-xl">
            <Briefcase className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Job Board</h1>
            <p className="text-sm text-muted-foreground">Construction jobs across Canada</p>
          </div>
        </div>
        <Link href="/tradehub">
          <Button variant="outline" className="gap-2 text-sm">
            <Briefcase className="h-4 w-4" />Post a Job
          </Button>
        </Link>
      </div>

      {/* Filters */}
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

      {/* Job List */}
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

            return (
              <Link key={job.id} href={`/tradehub/posts/${job.id}`}>
                <Card className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                        {job.profile?.avatarUrl
                          ? <img src={job.profile.avatarUrl} className="w-12 h-12 rounded-xl object-cover" alt="" />
                          : <span className="font-bold text-green-700 text-sm">{initials}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground text-base mb-1 hover:text-primary transition-colors">
                          {job.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {authorName}
                          {job.profile?.isVerified && (
                            <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">✓</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{job.content}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {job.trade && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Briefcase className="h-3 w-3" />{job.trade}
                            </span>
                          )}
                          {(job.location || job.province) && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />{[job.location, job.province].filter(Boolean).join(", ")}
                            </span>
                          )}
                          {job.budget && (
                            <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                              <DollarSign className="h-3 w-3" />{job.budget}
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
                      {job.applicationCount > 0 && (
                        <div className="flex-shrink-0 text-center">
                          <p className="text-lg font-bold text-foreground">{job.applicationCount}</p>
                          <p className="text-xs text-muted-foreground">applied</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
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
