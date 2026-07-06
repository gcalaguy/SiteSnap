import {
  listOpenJobPostings,
  listUsersNamesByIds,
  listCompaniesByIds,
  getJobPostingApplicationCounts,
  listMyJobPostingApplicationIds,
} from "../../repositories/tradehub";

export async function listJobPostingsWithMeta(opts: {
  province?: string;
  trade?: string;
  search?: string;
  userId?: number;
}) {
  const rows = await listOpenJobPostings({ province: opts.province, trade: opts.trade });
  if (rows.length === 0) return [];

  // Batch all ancillary lookups — one query each instead of N per posting.
  const postingIds = rows.map((r) => r.id);
  const posterIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as number[];
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter(Boolean))] as number[];

  const [posters, companies, appCounts, myApps] = await Promise.all([
    listUsersNamesByIds(posterIds),
    listCompaniesByIds(companyIds),
    getJobPostingApplicationCounts(postingIds),
    opts.userId ? listMyJobPostingApplicationIds(postingIds, opts.userId) : Promise.resolve([]),
  ]);

  const posterMap = new Map(posters.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const appCountMap = new Map(appCounts.map((r) => [r.jobPostingId, r.count]));
  const appliedSet = new Set(myApps.map((r) => r.jobPostingId));

  const result = rows.map((jp) => ({
    ...jp,
    posterName: posterMap.get(jp.createdBy) ?? "Unknown",
    companyName: companyMap.get(jp.companyId) ?? "Unknown",
    applicationCount: appCountMap.get(jp.id) ?? 0,
    hasApplied: appliedSet.has(jp.id),
  }));

  if (opts.search) {
    const q = opts.search.toLowerCase();
    return result.filter((r) => r.projectTitle.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }
  return result;
}
