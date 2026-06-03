import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListAllWorkerDocuments,
  useDeleteWorkerDocument,
  getListAllWorkerDocumentsQueryKey,
  type WorkerDocumentEnriched,
} from "@workspace/api-client-react";
import {
  ShieldCheck,
  Search,
  FileText,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Eye,
  Download,
  Image,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customFetch } from "@workspace/api-client-react";

const renderSafeDate = (dateString: any) => {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

function isImageFile(doc: WorkerDocumentEnriched): boolean {
  const url = doc.fileUrl?.toLowerCase() ?? "";
  const path = doc.filePath?.toLowerCase() ?? "";
  return (
    url.endsWith(".jpg") || url.endsWith(".jpeg") ||
    url.endsWith(".png") || url.endsWith(".webp") ||
    url.endsWith(".gif") || url.endsWith(".heic") ||
    path.endsWith(".jpg") || path.endsWith(".jpeg") ||
    path.endsWith(".png") || path.endsWith(".webp") ||
    path.endsWith(".gif") || path.endsWith(".heic")
  );
}

function getPreviewPath(doc: WorkerDocumentEnriched): string | null {
  const path = doc.filePath ?? doc.fileUrl;
  if (!path) return null;
  // Convert /objects/... paths to /api/storage/objects/... format
  const normalized = path.replace(/^\//, "");
  if (normalized.startsWith("objects/")) {
    return `/api/storage/${normalized}`;
  }
  if (normalized.startsWith("api/storage/")) {
    return `/${normalized}`;
  }
  return null;
}

function getSignedUrlPath(doc: WorkerDocumentEnriched): string | null {
  const path = doc.filePath ?? doc.fileUrl;
  if (!path) return null;
  const normalized = path.replace(/^\//, "");
  if (normalized.startsWith("objects/")) {
    const rest = normalized.replace(/^objects\//, "");
    return `/api/storage/objects/${rest}/signed-url`;
  }
  if (normalized.startsWith("api/storage/objects/")) {
    const rest = normalized.replace(/^api\/storage\/objects\//, "");
    return `/api/storage/objects/${rest}/signed-url`;
  }
  return null;
}

interface WorkerGroup {
  workerId: number;
  workerName: string;
  workerEmail: string;
  docs: WorkerDocumentEnriched[];
}

function groupByWorker(docs: WorkerDocumentEnriched[]): WorkerGroup[] {
  const map = new Map<number, WorkerGroup>();
  for (const d of docs) {
    const existing = map.get(d.workerId);
    if (existing) {
      existing.docs.push(d);
    } else {
      map.set(d.workerId, {
        workerId: d.workerId,
        workerName: d.workerName || "Unknown",
        workerEmail: d.workerEmail || "",
        docs: [d],
      });
    }
  }
  return Array.from(map.values());
}

export default function WorkerDocumentsPage() {
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const [search, setSearch] = useState("");
  const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<WorkerDocumentEnriched | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);

  const { data: docs = [], isLoading, error } = useListAllWorkerDocuments({
    query: {
      enabled: user != null,
      queryKey: getListAllWorkerDocumentsQueryKey(),
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  });

  const deleteDocument = useDeleteWorkerDocument({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllWorkerDocumentsQueryKey() });
        setSelectedDoc(null);
      },
    },
  });

  const groups = groupByWorker(docs);
  const filteredGroups = groups.filter((g) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const matchesWorker = g.workerName.toLowerCase().includes(q) || g.workerEmail.toLowerCase().includes(q);
    const matchesDoc = g.docs.some((d) => d.documentType.toLowerCase().includes(q));
    return matchesWorker || matchesDoc;
  });

  const openDoc = useCallback(async (doc: WorkerDocumentEnriched) => {
    setSelectedDoc(doc);
    setSignedUrl(null);
    const signedPath = getSignedUrlPath(doc);
    if (signedPath) {
      setLoadingSignedUrl(true);
      try {
        const { url } = await customFetch(signedPath) as { url: string };
        setSignedUrl(url);
      } catch {
        setSignedUrl(null);
      } finally {
        setLoadingSignedUrl(false);
      }
    }
  }, []);

  function handleDelete(id: number) {
    if (!confirm("Delete this document permanently?")) return;
    deleteDocument.mutate({ id });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8F8F8" }}>
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-[#C9A84C]" />
          <span className="text-sm text-[#0A0A0A]/60">Loading documents...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#F8F8F8" }}>
        <ShieldCheck className="w-12 h-12 text-red-400 mb-3" />
        <p className="text-sm text-red-500">Failed to load worker documents</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#F8F8F8" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#0A0A0A" }}>Worker Documents</h1>
            <p className="text-xs text-[#0A0A0A]/50 mt-0.5">Compliance vault by worker profile</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0A0A0A]/30" />
          <Input
            placeholder="Search by worker name or document type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-[#E5E5E5]"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold" style={{ color: "#0A0A0A" }}>{docs.length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Total Documents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-[#C9A84C]">{groups.length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Workers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-emerald-500">{docs.filter((d) => d.status === "active").length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Active</p>
            </CardContent>
          </Card>
        </div>

        {/* Worker Profiles */}
        {filteredGroups.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center">
            <FileText className="w-10 h-10 text-[#E5E5E5] mb-3" />
            <p className="text-sm text-[#0A0A0A]/50">No documents found</p>
            <p className="text-xs text-[#0A0A0A]/30 mt-1">Workers upload certificates from their mobile vault</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => {
              const isExpanded = expandedWorkerId === group.workerId;
              return (
                <Card key={group.workerId} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Profile Header */}
                    <button
                      onClick={() => setExpandedWorkerId(isExpanded ? null : group.workerId)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#FAFAFA] transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-[#C9A84C]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0A0A0A] truncate">{group.workerName}</p>
                        <p className="text-xs text-[#0A0A0A]/40 truncate">{group.workerEmail}</p>
                      </div>
                      <Badge variant="outline" className="bg-[#C9A84C]/10 text-[#C9A84C] border-[#C9A84C]/20 flex-shrink-0">
                        {group.docs.length} doc{group.docs.length > 1 ? "s" : ""}
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#0A0A0A]/30 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#0A0A0A]/30 flex-shrink-0" />
                      )}
                    </button>

                    {/* Documents Table */}
                    {isExpanded && (
                      <div className="border-t border-[#F0F0F0]">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[#FAFAFA]">
                              <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Document</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Uploaded</th>
                              <th className="text-right px-5 py-2.5 text-xs font-semibold text-[#0A0A0A]/40">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.docs.map((d) => {
                              const imageDoc = isImageFile(d);
                              const previewPath = getPreviewPath(d);
                              return (
                                <tr
                                  key={d.id}
                                  className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA] cursor-pointer"
                                  onClick={() => openDoc(d)}
                                >
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                      {imageDoc && previewPath ? (
                                        <img
                                          src={previewPath}
                                          alt={d.documentType}
                                          className="w-10 h-10 rounded-lg object-cover border border-[#E5E5E5] flex-shrink-0"
                                          loading="lazy"
                                          onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
                                          {imageDoc ? (
                                            <Image className="w-4 h-4 text-[#0A0A0A]/30" />
                                          ) : (
                                            <FileText className="w-4 h-4 text-[#0A0A0A]/30" />
                                          )}
                                        </div>
                                      )}
                                      <div>
                                        <Badge variant="outline" className="bg-[#C9A84C]/10 text-[#C9A84C] border-[#C9A84C]/20 font-medium">
                                          {d.documentType}
                                        </Badge>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-[#0A0A0A]/60">
                                    {renderSafeDate(d.createdAt)}
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(d.id);
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Document Detail Dialog */}
      {selectedDoc && (
        <Dialog open onOpenChange={() => { setSelectedDoc(null); setSignedUrl(null); }}>
          <DialogContent className="max-w-lg bg-white border-[#E5E5E5]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold" style={{ color: "#0A0A0A" }}>
                {selectedDoc.documentType}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {/* Document Preview */}
              {isImageFile(selectedDoc) && (
                <div className="rounded-lg border border-[#E5E5E5] overflow-hidden bg-[#FAFAFA] flex items-center justify-center min-h-[200px]">
                  {loadingSignedUrl ? (
                    <div className="flex items-center gap-2 text-[#0A0A0A]/40 py-8">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-xs">Loading preview...</span>
                    </div>
                  ) : signedUrl ? (
                    <img
                      src={signedUrl}
                      alt={selectedDoc.documentType}
                      className="max-w-full max-h-[400px] object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-[#0A0A0A]/40">
                      <Image className="w-8 h-8" />
                      <span className="text-xs">Preview unavailable</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[#0A0A0A]/40">Worker</p>
                  <p className="text-sm font-medium text-[#0A0A0A]">{selectedDoc.workerName || "Unknown"}</p>
                  <p className="text-xs text-[#0A0A0A]/40">{selectedDoc.workerEmail || ""}</p>
                </div>
                <div>
                  <p className="text-xs text-[#0A0A0A]/40">Status</p>
                  <Badge className={selectedDoc.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-100 mt-1" : "bg-gray-100 text-gray-500 border-gray-200 mt-1"}>
                    {selectedDoc.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-[#0A0A0A]/40">Uploaded</p>
                  <p className="text-sm font-medium text-[#0A0A0A]">{renderSafeDate(selectedDoc.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#0A0A0A]/40">File</p>
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={selectedDoc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#C9A84C] hover:underline break-all"
                    >
                      Open document
                    </a>
                    <Download className="w-3 h-3 text-[#C9A84C]" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                  onClick={() => {
                    handleDelete(selectedDoc.id);
                    setSelectedDoc(null);
                    setSignedUrl(null);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
