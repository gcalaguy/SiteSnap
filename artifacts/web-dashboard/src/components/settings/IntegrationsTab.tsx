import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, FolderOpen, HardDrive, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDriveSync } from "@/hooks/settings/useDriveSync";

export function IntegrationsTab() {
  const [collapsed, setCollapsed] = useState(true);
  const { state, loading, selecting, supported, handleToggle, handleSelectFolder, handleClear } = useDriveSync();

  return (
    <Card>
      <button onClick={() => setCollapsed(c => !c)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Automated Network/Local Drive Sync
            </CardTitle>
            <CardDescription>
              Automatically save copies of invoices, quotes, estimates, spreadsheets, and uploaded files
              to a local folder or mapped network drive.
            </CardDescription>
          </div>
          {collapsed
            ? <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
            : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />}
        </CardHeader>
      </button>
      {!collapsed && (
        <CardContent className="space-y-4">
        {!supported && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              This feature requires a browser that supports the File System Access API
              (e.g. Chrome or Edge). It will not work in Safari or Firefox.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Enable automatic sync</p>
            <p className="text-xs text-muted-foreground">
              Every PDF, Excel, Word, CSV, or image export/upload will be mirrored to the selected folder.
            </p>
          </div>
          <button
            onClick={() => handleToggle(!state.enabled)}
            disabled={loading}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              state.enabled ? "bg-primary" : "bg-input",
              loading && "opacity-50 cursor-not-allowed"
            )}
            role="switch"
            aria-checked={state.enabled}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                state.enabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            disabled={selecting}
            onClick={handleSelectFolder}
          >
            {selecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            {state.pathName ? "Change Destination Folder" : "Select Destination Folder"}
          </Button>

          {state.pathName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{state.pathName}</span>
              <button
                onClick={handleClear}
                className="text-xs text-destructive hover:underline"
                title="Clear selected folder"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </CardContent>
    )}
    </Card>
  );
}
