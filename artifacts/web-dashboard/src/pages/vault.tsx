import { useState } from "react";
import { useLocation } from "wouter";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Search,
  FileText,
  AlertTriangle,
  ChevronRight,
  Trash2,
  RefreshCw,
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

interface WorkerDoc {
  id: number;
  workerId: number;
  workerName?: string;
  workerEmail?: string | null;
  companyId: number;
  documentType: string;
  fileUrl: string;
  filePath: string | null;
  expirationDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No expiry";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? "No expiry" : d.toLocaleDateString("en-CA");
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getTime() < Date.now();
}

export default function WorkerDocumentsPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<WorkerDoc | null>(null);

  const { data: docs = [], isLoading, error, refetch } = useQuery<WorkerDoc[]>({
    queryKey: ["worker-documents"],
    queryFn: () => customFetch<WorkerDoc[]>("/api/tenant/vault/all-documents"),
    enabled: user != null,
  });

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (d.workerName?.toLowerCase() || "").includes(q) ||
      d.documentType.toLowerCase().includes(q);
    const matchesType = filterType ? d.documentType === filterType : true;
    return matchesSearch && matchesType;
  });

  const docTypes = [...new Set(docs.map((d) => d.documentType))].sort();

  async function handleDelete(id: number) {
    if (!confirm("Delete this document permanently?")) return;
    await customFetch(`/api/worker/vault/documents/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["worker-documents"] });
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
        <Button onClick={() => refetch()} className="mt-4 bg-[#C9A84C] text-white" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
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
            <p className="text-xs text-[#0A0A0A]/50 mt-0.5">Compliance certificates & ID vault</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0A0A0A]/30" />
            <Input
              placeholder="Search by worker or document type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-[#E5E5E5]"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              variant={filterType === null ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(null)}
              className={filterType === null ? "bg-[#C9A84C] text-white" : "border-[#E5E5E5]"}
            >
              All
            </Button>
            {docTypes.map((t) => (
              <Button
                key={t}
                variant={filterType === t ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType(filterType === t ? null : t)}
                className={filterType === t ? "bg-[#C9A84C] text-white" : "border-[#E5E5E5]"}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold" style={{ color: "#0A0A0A" }}>{docs.length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Total Documents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-[#C9A84C]">{[...new Set(docs.map((d) => d.workerId))].length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Workers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-red-500">{docs.filter((d) => isExpired(d.expirationDate)).length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Expired</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-emerald-500">{docs.filter((d) => d.status === "active").length}</p>
              <p className="text-xs text-[#0A0A0A]/50 mt-1">Active</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center text-center">
                <FileText className="w-10 h-10 text-[#E5E5E5] mb-3" />
                <p className="text-sm text-[#0A0A0A]/50">No documents found</p>
                <p className="text-xs text-[#0A0A0A]/30 mt-1">Workers upload certificates from their mobile vault</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5E5] bg-white/60">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#0A0A0A]/50">Worker</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#0A0A0A]/50">Document</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#0A0A0A]/50">Expiry</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#0A0A0A]/50">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#0A0A0A]/50">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const expired = isExpired(d.expirationDate);
                      return (
                        <tr
                          key={d.id}
                          className="border-b border-[#F0F0F0] hover:bg-[#FAFAFA] cursor-pointer"
                          onClick={() => setSelectedDoc(d)}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-[#0A0A0A]">{d.workerName || "Unknown"}</p>
                              <p className="text-xs text-[#0A0A0A]/40">{d.workerEmail || ""}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="bg-[#C9A84C]/10 text-[#C9A84C] border-[#C9A84C]/20 font-medium">
                              {d.documentType}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={expired ? "text-red-500 font-medium" : "text-[#0A0A0A]/70"}>
                                {formatDate(d.expirationDate)}
                              </span>
                              {expired && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={d.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-gray-100 text-gray-500 border-gray-200"}>
                              {d.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
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
                              <ChevronRight className="w-4 h-4 text-[#0A0A0A]/20" />
                            </div>
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
      </div>

      {/* Document Detail Dialog */}
      {selectedDoc && (
        <Dialog open onOpenChange={() => setSelectedDoc(null)}>
          <DialogContent className="max-w-md bg-white border-[#E5E5E5]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold" style={{ color: "#0A0A0A" }}>
                {selectedDoc.documentType}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <p className="text-xs text-[#0A0A0A]/40">Worker</p>
                <p className="text-sm font-medium text-[#0A0A0A]">{selectedDoc.workerName || "Unknown"}</p>
                <p className="text-xs text-[#0A0A0A]/40">{selectedDoc.workerEmail || ""}</p>
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="text-xs text-[#0A0A0A]/40">Status</p>
                  <Badge className={selectedDoc.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-100 mt-1" : "bg-gray-100 text-gray-500 border-gray-200 mt-1"}>
                    {selectedDoc.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-[#0A0A0A]/40">Expires</p>
                  <p className={`text-sm font-medium mt-1 ${isExpired(selectedDoc.expirationDate) ? "text-red-500" : "text-[#0A0A0A]"}`}>
                    {formatDate(selectedDoc.expirationDate)}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#0A0A0A]/40">File URL</p>
                <a
                  href={selectedDoc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#C9A84C] hover:underline break-all"
                >
                  {selectedDoc.fileUrl}
                </a>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                  onClick={() => {
                    handleDelete(selectedDoc.id);
                    setSelectedDoc(null);
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
