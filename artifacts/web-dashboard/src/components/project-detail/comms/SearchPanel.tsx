import { useState } from "react";
import { Link } from "wouter";
import {
  useSearchCommunications,
  type CommunicationSearchCriteria,
  type StructuredEmailSearchResult,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, ArrowRight } from "lucide-react";

const ATTACHMENT_TYPES: { value: NonNullable<CommunicationSearchCriteria["attachmentTypes"]>[number]; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "invoice", label: "Invoice" },
  { value: "quote", label: "Quote" },
  { value: "permit", label: "Permit" },
  { value: "inspection_report", label: "Inspection" },
  { value: "image", label: "Images" },
];

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/**
 * Embedded, project-scoped slice of the full Advanced Search Builder
 * (pages/communications-search.tsx) — keywords + attachment-type filters
 * fixed to this project via criteria.projectId. Deliberately a smaller
 * surface than the full page (no saved templates, no Ask AI, no nested
 * condition tree) rather than a shared-component refactor of that
 * already-working page — a "More search options" link routes there for
 * anything beyond this.
 */
export function SearchPanel({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [keywords, setKeywords] = useState("");
  const [attachmentTypes, setAttachmentTypes] = useState<NonNullable<CommunicationSearchCriteria["attachmentTypes"]>>([]);
  const [results, setResults] = useState<StructuredEmailSearchResult[] | null>(null);

  const { mutateAsync: runSearch, isPending: searching } = useSearchCommunications();

  function toggleType(type: NonNullable<CommunicationSearchCriteria["attachmentTypes"]>[number]) {
    setAttachmentTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSearch() {
    try {
      const result = await runSearch({
        data: { keywords: keywords.trim() || undefined, attachmentTypes: attachmentTypes.length ? attachmentTypes : undefined, projectId },
        params: { limit: 30 },
      });
      setResults(result.results);
    } catch {
      toast({ title: "Search failed", description: "Please try again.", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords…"
            className="pl-9 bg-background border-border"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} disabled={searching} className="bg-primary text-black hover:bg-primary/90">
          {searching && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
          Search
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ATTACHMENT_TYPES.map((opt) => {
          const active = attachmentTypes.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleType(opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <Link href="/communications-search" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        More search options (Advanced, Ask AI, saved templates) <ArrowRight className="w-3 h-3" />
      </Link>

      {results != null && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-foreground/50">{results.length} result{results.length === 1 ? "" : "s"}</p>
          {results.length === 0 ? (
            <p className="text-sm text-foreground/50 py-6 text-center">No matches</p>
          ) : (
            results.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium truncate">{r.subject || "(no subject)"}</p>
                  <p className="text-xs text-foreground/50 truncate mt-0.5">
                    {r.from_name || r.from_email || ""} · {relativeDateLabel(r.sent_at)}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
