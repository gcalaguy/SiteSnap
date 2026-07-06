import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  loadDriveSyncState,
  saveDriveSyncState,
  clearDriveSyncState,
  isFileSystemAccessSupported,
  type DriveSyncState,
} from "@/lib/driveSyncManager";

export function useDriveSync() {
  const { toast } = useToast();
  const [state, setState] = useState<DriveSyncState>({ enabled: false, handle: null, pathName: null });
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    loadDriveSyncState().then((s) => {
      setState(s);
      setLoading(false);
    });
  }, []);

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

  async function handleClear() {
    setState({ enabled: false, handle: null, pathName: null });
    await clearDriveSyncState();
    toast({ title: "Drive sync reset" });
  }

  const supported = isFileSystemAccessSupported();

  return { state, loading, selecting, supported, handleToggle, handleSelectFolder, handleClear };
}
