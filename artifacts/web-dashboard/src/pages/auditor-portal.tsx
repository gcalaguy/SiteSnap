import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatDate as fmtDate } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number;
  sourceType: string;
  findingType: string;
  findingDescription: string | null;
  complianceScore: number | null;
  createdAt: string;
}

interface CapaTicket {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  closedAt: string | null;
}

interface PolicyDoc {
  id: number;
  title: string;
  documentType: string;
  signedCount: number;
  totalWorkers: number;
}

interface Inspection {
  id: number;
  inspectionType: string;
  date: string;
  score: number | null;
  status: string;
}

interface ElementData {
  key: string;
  entryCount: number;
  passCount: number;
  failCount: number;
  averageScore: number;
  lastSubmittedAt: string | null;
  auditEntries: AuditEntry[];
  capaTickets: CapaTicket[];
  policyDocuments: PolicyDoc[];
}

interface PortalData {
  token: { label: string; expiresAt: string; accessCount: number; createdAt: string };
  companyName: string;
  elements: ElementData[];
  recentInspections: Inspection[];
  expiringCredentialCount: number;
  flaggedSubcontractorCount: number;
  totalWorkerCount: number;
}

// ── IHSA element definitions ──────────────────────────────────────────────────

const ELEMENT_NAMES: Record<string, string> = {
  element_1:  "Management Leadership",
  element_2:  "Hazard ID & Assessment",
  element_3:  "Hazard Control",
  element_4:  "Ongoing Inspections",
  element_5:  "Qualifications & Training",
  element_6:  "Emergency Response",
  element_7:  "Incident Reporting",
  element_8:  "Program Administration",
  element_9:  "Worker Participation",
  element_10: "Workplace Housekeeping",
  element_11: "Environmental Protection",
  element_12: "Safety Equipment & First Aid",
  element_13: "Fire Safety",
  element_14: "WHMIS & Controlled Products",
  element_15: "Contractor Management",
  element_16: "Medical Management",
  element_17: "Joint Health & Safety Committee",
  element_18: "Occupational Health",
  element_19: "Records & Statistics",
};

const ELEMENT_NUMBERS: Record<string, number> = Object.fromEntries(
  Object.keys(ELEMENT_NAMES).map((k) => [k, parseInt(k.replace("element_", ""))]),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeUntilExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 1) return `${days} days`;
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  if (hrs > 1) return `${hrs} hours`;
  return "< 1 hour";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#facc15";
  if (score >= 40) return "#fb923c";
  return "#f87171";
}

function capaPriorityColor(priority: string): string {
  const map: Record<string, string> = { critical: "#f87171", high: "#fb923c", medium: "#facc15", low: "#86efac" };
  return map[priority] ?? "#9ca3af";
}

function capaStatusBg(status: string): string {
  const map: Record<string, string> = {
    open: "#7f1d1d",
    in_progress: "#1e3a5f",
    pending_review: "#3b2700",
    closed: "#14532d",
    void: "#1f2937",
  };
  return map[status] ?? "#374151";
}

function docTypeLabel(t: string): string {
  const map: Record<string, string> = { swp: "Safe Work Procedure", jha: "Job Hazard Analysis", company_rules: "Company Rules", policy: "Policy" };
  return map[t] ?? t;
}

// ── Score arc gauge ───────────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number }) {
  const r = 54;
  const cx = 64;
  const cy = 64;
  const startAngle = -210;
  const endAngle = 30;
  const totalArc = endAngle - startAngle;
  const filled = (score / 100) * totalArc;

  function polar(angle: number, radius: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(start: number, end: number, radius: number) {
    const s = polar(start, radius);
    const e = polar(end, radius);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32">
      <path d={arcPath(startAngle, endAngle, r)} fill="none" stroke="#2a2a2a" strokeWidth="10" strokeLinecap="round" />
      {score > 0 && (
        <path d={arcPath(startAngle, startAngle + filled, r)} fill="none" stroke={scoreColor(score)} strokeWidth="10" strokeLinecap="round" />
      )}
      <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="monospace">{score}%</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill="#9ca3af" fontSize="9">PREDICTED</text>
    </svg>
  );
}

// ── Mini score bar ────────────────────────────────────────────────────────────

function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ width: 200, fontSize: 12, color: "#d1d5db", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "#2a2a2a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: scoreColor(score), borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ width: 36, textAlign: "right", fontSize: 12, color: scoreColor(score), fontVariantNumeric: "tabular-nums" }}>{score}%</span>
    </div>
  );
}

// ── Element accordion card ────────────────────────────────────────────────────

function ElementCard({ el, search }: { el: ElementData; search: string }) {
  const [expanded, setExpanded] = useState(false);
  const num = ELEMENT_NUMBERS[el.key];
  const name = ELEMENT_NAMES[el.key] ?? el.key;

  const openCapas = el.capaTickets.filter((c) => c.status !== "closed" && c.status !== "void").length;
  const overdueCapa = el.capaTickets.filter((c) => c.status !== "closed" && c.status !== "void" && c.dueDate && new Date(c.dueDate) < new Date()).length;

  const hasEvidence = el.entryCount > 0 || el.policyDocuments.length > 0;

  // Highlight search
  const lowerSearch = search.toLowerCase();
  const matchesSearch = !lowerSearch || name.toLowerCase().includes(lowerSearch) || `element ${num}`.includes(lowerSearch)
    || el.auditEntries.some((e) => e.findingDescription?.toLowerCase().includes(lowerSearch))
    || el.policyDocuments.some((p) => p.title.toLowerCase().includes(lowerSearch))
    || el.capaTickets.some((c) => c.title.toLowerCase().includes(lowerSearch));

  if (!matchesSearch) return null;

  return (
    <div style={{ background: "#111111", border: `1px solid ${expanded ? "#C9A84C44" : "#2a2a2a"}`, borderRadius: 8, marginBottom: 8, overflow: "hidden", transition: "border-color 0.2s" }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #C9A84C44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#C9A84C", flexShrink: 0 }}>{num}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#f3f4f6" }}>{name}</span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!hasEvidence && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#450a0a", color: "#fca5a5", border: "1px solid #7f1d1d" }}>No Evidence</span>
          )}
          {openCapas > 0 && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#422006", color: "#fdba74", border: "1px solid #7c2d12" }}>
              {openCapas} CAPA{openCapas !== 1 ? "s" : ""}
              {overdueCapa > 0 && ` (${overdueCapa} overdue)`}
            </span>
          )}
          <span style={{ fontSize: 12, color: "#6b7280", minWidth: 80, textAlign: "right" }}>
            {el.entryCount > 0 ? `${el.entryCount} entries` : "0 entries"}
          </span>
          {el.entryCount > 0 && (
            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: scoreColor(el.averageScore), minWidth: 38, textAlign: "right" }}>{el.averageScore}%</span>
          )}
          <span style={{ color: expanded ? "#C9A84C" : "#4b5563", fontSize: 16, lineHeight: 1, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid #1f1f1f", padding: "16px 20px" }}>
          {/* Stats row */}
          <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "Audit Entries", value: el.entryCount, sub: `${el.passCount}↑ ${el.failCount}↓` },
              { label: "Avg Score", value: el.entryCount > 0 ? `${el.averageScore}%` : "—" },
              { label: "Last Submitted", value: fmtDate(el.lastSubmittedAt) },
              { label: "CAPAs", value: el.capaTickets.length, sub: openCapas > 0 ? `${openCapas} open` : "all closed" },
              { label: "Policies", value: el.policyDocuments.length },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#1a1a1a", borderRadius: 6, padding: "8px 14px", minWidth: 80, border: "1px solid #2a2a2a" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6", lineHeight: 1 }}>{stat.value}</div>
                {stat.sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{stat.sub}</div>}
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Audit Entries */}
          {el.auditEntries.length > 0 && (
            <Section title="Audit Trail Entries">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#6b7280", borderBottom: "1px solid #2a2a2a" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Date</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Source</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Finding</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Description</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {el.auditEntries.slice(0, 20).map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                      <td style={{ padding: "5px 8px", color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(e.createdAt)}</td>
                      <td style={{ padding: "5px 8px", color: "#d1d5db" }}>{e.sourceType.replace(/_/g, " ")}</td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 11, background: e.findingType === "pass" ? "#14532d" : "#450a0a", color: e.findingType === "pass" ? "#86efac" : "#fca5a5" }}>
                          {e.findingType}
                        </span>
                      </td>
                      <td style={{ padding: "5px 8px", color: "#d1d5db", maxWidth: 280 }}>{e.findingDescription ?? "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: e.complianceScore !== null ? scoreColor(e.complianceScore) : "#4b5563" }}>
                        {e.complianceScore !== null ? `${e.complianceScore}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {el.auditEntries.length > 20 && (
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>Showing 20 of {el.auditEntries.length} entries</p>
              )}
            </Section>
          )}

          {/* CAPA Tickets */}
          {el.capaTickets.length > 0 && (
            <Section title="CAPA Corrective Actions">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {el.capaTickets.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#1a1a1a", borderRadius: 6, border: "1px solid #2a2a2a" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: capaPriorityColor(c.priority), flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb" }}>{c.title}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: capaStatusBg(c.status), color: "#e5e7eb" }}>{c.status.replace(/_/g, " ")}</span>
                    {c.dueDate && (
                      <span style={{ fontSize: 11, color: new Date(c.dueDate) < new Date() && c.status !== "closed" && c.status !== "void" ? "#f87171" : "#6b7280" }}>
                        Due {fmtDate(c.dueDate)}
                      </span>
                    )}
                    {c.closedAt && <span style={{ fontSize: 11, color: "#4ade80" }}>Closed {fmtDate(c.closedAt)}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Policy Documents */}
          {el.policyDocuments.length > 0 && (
            <Section title="Policy Documents & Sign-offs">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {el.policyDocuments.map((p) => {
                  const pct = p.totalWorkers > 0 ? Math.round((p.signedCount / p.totalWorkers) * 100) : 0;
                  return (
                    <div key={p.id} style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 6, border: "1px solid #2a2a2a" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 500 }}>{p.title}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{docTypeLabel(p.documentType)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "#2a2a2a", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: scoreColor(pct), transition: "width 0.5s ease" }} />
                        </div>
                        <span style={{ fontSize: 12, color: scoreColor(pct), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {p.signedCount}/{p.totalWorkers} signed ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {!hasEvidence && (
            <div style={{ textAlign: "center", padding: "24px", color: "#4b5563", fontSize: 13 }}>
              No evidence records on file for this element.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ fontSize: 11, fontWeight: 600, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, margin: "0 0 8px" }}>{title}</h4>
      {children}
    </div>
  );
}

// ── Main portal page ──────────────────────────────────────────────────────────

export default function AuditorPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [search, setSearch] = useState("");
  const [showInspections, setShowInspections] = useState(false);

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ["auditor-portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/auditor/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load auditor portal");
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const overallScore = useMemo(() => {
    if (!data) return 0;
    const covered = data.elements.filter((e) => e.entryCount > 0);
    if (covered.length === 0) return 0;
    return Math.round(covered.reduce((sum, e) => sum + e.averageScore, 0) / covered.length);
  }, [data]);

  const coveredCount = data?.elements.filter((e) => e.entryCount > 0).length ?? 0;

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, border: "3px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading auditor portal…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ color: "#f3f4f6", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Access Unavailable</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.6 }}>
            {error instanceof Error ? error.message : "This auditor link is invalid, expired, or has been revoked."}
          </p>
          <p style={{ color: "#4b5563", fontSize: 12, marginTop: 16 }}>If you believe this is an error, contact the company that shared this link.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f3f4f6", fontFamily: "Inter, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #111111 0%, #0a0a0a 100%)", borderBottom: "1px solid #1f1f1f", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "linear-gradient(135deg, #C9A84C, #a07830)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#0a0a0a" }}>
              COR
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f3f4f6" }}>{data.companyName}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>IHSA COR Compliance Evidence Portal</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{data.token.label}</div>
              <div style={{ fontSize: 11, color: timeUntilExpiry(data.token.expiresAt) === "Expired" ? "#f87171" : "#4b5563" }}>
                Expires: {timeUntilExpiry(data.token.expiresAt)} · View #{data.token.accessCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        {/* Summary hero */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 32, marginBottom: 36, background: "#111111", border: "1px solid #1f1f1f", borderRadius: 12, padding: 28, alignItems: "center" }}>
          <ScoreArc score={overallScore} />
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f3f4f6", margin: "0 0 4px" }}>COR Compliance Evidence Summary</h2>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>Based on field logs, safety records, policy sign-offs, and CAPA tickets on file.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {[
                { label: "Elements with Evidence", value: `${coveredCount}/19` },
                { label: "Workers on File", value: data.totalWorkerCount },
                { label: "Expiring Credentials", value: data.expiringCredentialCount, warn: data.expiringCredentialCount > 0 },
                { label: "Flagged Subcontractors", value: data.flaggedSubcontractorCount, warn: data.flaggedSubcontractorCount > 0 },
                { label: "Recent Inspections", value: data.recentInspections.length },
                { label: "Generated", value: fmtDate(data.token.createdAt) },
              ].map((stat) => (
                <div key={stat.label} style={{ background: "#1a1a1a", borderRadius: 8, padding: "10px 14px", border: `1px solid ${stat.warn ? "#7c2d1244" : "#2a2a2a"}` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.warn ? "#fb923c" : "#f3f4f6", lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Score bars overview */}
        <div style={{ background: "#111111", border: "1px solid #1f1f1f", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>Element Score Overview</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 32px" }}>
            {data.elements.map((el) => (
              <ScoreBar key={el.key} score={el.entryCount > 0 ? el.averageScore : 0} label={`${ELEMENT_NUMBERS[el.key]}. ${ELEMENT_NAMES[el.key]}`} />
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search elements, descriptions, policies, CAPAs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 16px 10px 40px", background: "#111111", border: "1px solid #2a2a2a", borderRadius: 8, color: "#f3f4f6", fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#4b5563", fontSize: 16 }}>⌕</span>
        </div>

        {/* Element accordions */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>19 IHSA COR Elements — Evidence Index</h3>
        {data.elements.map((el) => (
          <ElementCard key={el.key} el={el} search={search} />
        ))}

        {/* Recent inspections (collapsible global section) */}
        {data.recentInspections.length > 0 && (
          <div style={{ background: "#111111", border: "1px solid #1f1f1f", borderRadius: 12, marginTop: 16, overflow: "hidden" }}>
            <button
              onClick={() => setShowInspections((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "transparent", border: "none", cursor: "pointer", color: "#f3f4f6" }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Recent Safety Inspections ({data.recentInspections.length})</span>
              <span style={{ color: "#4b5563", transform: showInspections ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </button>
            {showInspections && (
              <div style={{ borderTop: "1px solid #1f1f1f", padding: "0 20px 20px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 16 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", borderBottom: "1px solid #2a2a2a" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Date</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Type</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Status</th>
                      <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentInspections.map((i) => (
                      <tr key={i.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                        <td style={{ padding: "6px 8px", color: "#9ca3af" }}>{fmtDate(i.date)}</td>
                        <td style={{ padding: "6px 8px", color: "#d1d5db" }}>{i.inspectionType}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: i.status === "submitted" ? "#14532d" : "#1f2937", color: i.status === "submitted" ? "#86efac" : "#9ca3af" }}>
                            {i.status}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: i.score !== null ? scoreColor(i.score) : "#4b5563" }}>
                          {i.score !== null ? `${i.score}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, textAlign: "center", borderTop: "1px solid #1a1a1a", paddingTop: 24 }}>
          <p style={{ fontSize: 11, color: "#374151" }}>This portal is read-only and time-limited. Evidence shown covers the last 12 months.</p>
          <p style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>Powered by <span style={{ color: "#C9A84C" }}>SiteSnap</span> — Ontario COR Compliance Platform</p>
        </div>
      </div>
    </div>
  );
}
