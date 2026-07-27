import { useEffect, useState } from "react";
import { Folder, FolderOpen, ChevronRight, ArrowUp, Home, Loader2, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MountDirListing } from "@/hooks/settings/useBackup";

interface MountFolderPickerProps {
  mountKey: string;
  value: string;
  onChange: (subpath: string) => void;
  browseMount: (mountKey: string, subpath: string) => Promise<MountDirListing>;
}

/**
 * Lets an owner navigate the folders under an operator-approved backup mount
 * and pick one, instead of free-typing a server path. Browsing (and the final
 * selection) is confined server-side to the chosen mountKey's allowlisted
 * base — this only ever reads/selects within that sandbox.
 */
export function MountFolderPicker({ mountKey, value, onChange, browseMount }: MountFolderPickerProps) {
  const [browsePath, setBrowsePath] = useState(value);
  const [listing, setListing] = useState<MountDirListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    setBrowsePath(value);
  }, [mountKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mountKey) return;
    let cancelled = false;
    setLoading(true);
    browseMount(mountKey, browsePath)
      .then((res) => {
        if (!cancelled) setListing(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setListing({ subpath: browsePath, entries: [], exists: false, error: err instanceof Error ? err.message : String(err) });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mountKey, browsePath, browseMount]);

  if (!mountKey) return null;

  const segments = browsePath ? browsePath.split("/").filter(Boolean) : [];

  function goToSegment(index: number) {
    setNewFolderName("");
    setBrowsePath(segments.slice(0, index + 1).join("/"));
  }

  function goUp() {
    setNewFolderName("");
    setBrowsePath(segments.slice(0, -1).join("/"));
  }

  function enterNewFolder() {
    const name = newFolderName.trim();
    if (!name || name.includes("/") || name.includes("\\") || name === "..") return;
    setBrowsePath(browsePath ? `${browsePath}/${name}` : name);
    setNewFolderName("");
  }

  const isSelected = browsePath === value;

  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap text-xs">
        <button
          type="button"
          onClick={() => {
            setNewFolderName("");
            setBrowsePath("");
          }}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted",
            browsePath === "" ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          <Home className="h-3 w-3" />
          {mountKey}
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              type="button"
              onClick={() => goToSegment(i)}
              className={cn(
                "px-1.5 py-0.5 rounded hover:bg-muted",
                i === segments.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Listing */}
      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-muted/30">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={goUp}
            disabled={segments.length === 0}
          >
            <ArrowUp className="h-3 w-3" />
            Up
          </Button>
          <span className="text-xs text-muted-foreground truncate max-w-[50%]">
            /{mountKey}{browsePath ? `/${browsePath}` : ""}
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !listing?.exists ? (
            <div className="flex flex-col items-center gap-1.5 py-6 px-4 text-center">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-xs text-muted-foreground">
                {listing?.error
                  ? `Can't read this location: ${listing.error}`
                  : segments.length === 0
                    ? "This mount isn't reachable from the server (not attached, or a permissions issue). Contact your administrator."
                    : "This folder doesn't exist yet — it will be created automatically on the first backup."}
              </p>
            </div>
          ) : listing.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No subfolders here.</p>
          ) : (
            <ul>
              {listing.entries.map((entry) => (
                <li key={entry.subpath}>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFolderName("");
                      setBrowsePath(entry.subpath);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 text-left"
                  >
                    <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                enterNewFolder();
              }
            }}
            placeholder="New folder name…"
            className="h-7 text-xs"
          />
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 gap-1 shrink-0" onClick={enterNewFolder}>
            <Plus className="h-3 w-3" />
            Go
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">
          Selected: <span className="font-medium text-foreground">/{mountKey}{value ? `/${value}` : ""}</span>
        </p>
        <Button
          type="button"
          size="sm"
          variant={isSelected ? "secondary" : "default"}
          className="gap-1.5 shrink-0"
          disabled={isSelected}
          onClick={() => onChange(browsePath)}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {isSelected ? "Selected" : "Use this folder"}
        </Button>
      </div>
    </div>
  );
}
