import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  loadDriveSyncState,
  saveDriveSyncState,
  clearDriveSyncState,
  isFileSystemAccessSupported,
  type DriveSyncState,
} from "@/lib/driveSyncManager";
import {
  getDriveSyncStatus,
  subscribeDriveSyncStatus,
  type DriveSyncStatus,
} from "@/lib/driveSyncStatus";

export function useDriveSync() {
  const { toast } = useToast();
  const [state, setState] = useState<DriveSyncState>({ enabled: false, handle: null, pathName: null });
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [syncStatus, setSyncStatus] = useState<DriveSyncStatus>(getDriveSyncStatus());

  useEffect(() => {
    loadDriveSyncState().then(async (s) => {
      setState(s);
      setLoading(false);
      if (s.enabled && s.handle) {
        // queryPermission (unlike requestPermission) doesn't require a user gesture, so it's
        // safe to check on mount. Browsers commonly revoke readwrite grants on reload.
        try {
          const status = await s.handle.queryPermission({ mode: "readwrite" });
          setNeedsReauth(status !== "granted");
        } catch {
          setNeedsReauth(true);
        }
      }
    });
  }, []);

  useEffect(() => subscribeDriveSyncStatus(setSyncStatus), []);

  async function handleToggle(checked: boolean) {
    const next = { ...state, enabled: checked };
    setState(next);
    await saveDriveSyncState(next);
    toast({ title: checked ? "Drive sync enabled" : "Drive sync disabled" });
  }

  async function handleSelectFolder() {
    if (!isFileSystemAccessSupported()) {
      toast({
        title: "Browser not supported",
        description: "Your browser does not support the File System Access API. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    setSelecting(true);
    try {
      const handle = await window.showDirectoryPicker();
      const next: DriveSyncState = { enabled: true, handle, pathName: handle.name };
      setState(next);
      setNeedsReauth(false);
      await saveDriveSyncState(next);
      toast({ title: "Destination folder selected", description: handle.name });
    } catch (err) {
      const name = err instanceof Error ? err.name : undefined;
      if (name === "SecurityError" || name === "NotAllowedError") {
        toast({
          title: "Cannot open folder picker",
          description: "Your browser or iframe blocked the folder picker. Try opening the app in a standalone browser window.",
          variant: "destructive",
        });
      } else if (name !== "AbortError") {
        toast({
          title: "Folder picker failed",
          description: (err instanceof Error && err.message) || "Could not open the folder picker.",
          variant: "destructive",
        });
      }
    } finally {
      setSelecting(false);
    }
  }

  async function handleReauthorize() {
    if (!state.handle) return;
    setReauthorizing(true);
    try {
      const result = await state.handle.requestPermission({ mode: "readwrite" });
      if (result === "granted") {
        setNeedsReauth(false);
        toast({ title: "Access re-authorized", description: "Drive sync will resume." });
      } else {
        toast({
          title: "Permission denied",
          description: "Select the destination folder again to keep syncing.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Re-authorization failed",
        description: (err instanceof Error && err.message) || "Could not re-authorize folder access.",
        variant: "destructive",
      });
    } finally {
      setReauthorizing(false);
    }
  }

  async function handleClear() {
    setState({ enabled: false, handle: null, pathName: null });
    setNeedsReauth(false);
    await clearDriveSyncState();
    toast({ title: "Drive sync reset" });
  }

  const supported = isFileSystemAccessSupported();

  return {
    state,
    loading,
    selecting,
    reauthorizing,
    needsReauth,
    syncStatus,
    supported,
    handleToggle,
    handleSelectFolder,
    handleReauthorize,
    handleClear,
  };
}
