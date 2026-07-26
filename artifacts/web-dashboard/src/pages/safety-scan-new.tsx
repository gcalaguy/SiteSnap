import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectSelect } from "@/components/cor-compliance/shared";
import { GpsLockedBanner } from "@/components/safety-scanner/GpsLockedBanner";
import { useCreateSafetyScan } from "@/hooks/safety-scanner/useSafetyScan";
import { customFetch } from "@workspace/api-client-react";

const GOLD = "#C9A84C";
const MAX_PHOTOS = 8;

interface GpsState {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracyM: number | null;
  capturedAtUtc: string;
  timezone: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=json`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await res.json();
    const addr = data.address ?? {};
    const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
    const city = addr.city ?? addr.town ?? addr.village ?? "";
    return [street, city].filter(Boolean).join(", ") || data.display_name || null;
  } catch {
    return null;
  }
}

export default function SafetyScanNewPage() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [siteAddress, setSiteAddress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const createScan = useCreateSafetyScan((scan) => setLocation(`/safety-scan/${scan.id}`));

  function lockGps() {
    if (!navigator.geolocation) {
      setGpsDenied(true);
      return;
    }
    setGpsLoading(true);
    setGpsDenied(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, altitude, accuracy } = pos.coords;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const address = await reverseGeocode(latitude, longitude);
        setGps({
          lat: latitude, lng: longitude,
          altitude: altitude ?? null, accuracyM: accuracy ?? null,
          capturedAtUtc: new Date().toISOString(), timezone,
        });
        setSiteAddress(address);
        setGpsLoading(false);
      },
      () => { setGpsDenied(true); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const newFiles = Array.from(list).slice(0, MAX_PHOTOS - files.length);
    setFiles((prev) => [...prev, ...newFiles].slice(0, MAX_PHOTOS));
    setPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))].slice(0, MAX_PHOTOS));
    if (!gps && !gpsLoading) lockGps();
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadOne(file: File): Promise<string> {
    const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
      "/api/storage/uploads/request-url",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
    );
    const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!putRes.ok) throw new Error("Upload failed");
    return objectPath;
  }

  async function submit() {
    if (!projectId || files.length === 0 || !gps) return;
    setUploading(true);
    try {
      const objectPaths = await Promise.all(files.map(uploadOne));
      createScan.mutate({
        projectId: parseInt(projectId),
        objectPaths,
        gps,
        siteAddress: siteAddress ?? undefined,
      });
    } catch {
      // useCreateSafetyScan's onError toast covers user-facing failure messaging
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = !!projectId && files.length > 0 && !!gps && !gpsLoading && !uploading && !createScan.isPending;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">New AI Safety Scan</h1>
        <p className="text-sm text-zinc-500 mt-1">Upload site photos for GPS-tagged PPE & hazard analysis.</p>
      </div>

      <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
        <CardContent className="p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Project</p>
            <ProjectSelect value={projectId} onChange={setProjectId} />
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Photos ({files.length}/{MAX_PHOTOS})</p>
            <div className="grid grid-cols-4 gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center"
                    style={{ background: "#dc2626" }}
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
              {files.length < MAX_PHOTOS && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg flex items-center justify-center"
                  style={{ border: "2px dashed #333" }}
                >
                  <Camera className="h-6 w-6 text-zinc-600" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <GpsLockedBanner
              loading={gpsLoading}
              denied={gpsDenied}
              info={gps ? { siteAddress, capturedAt: new Date(gps.capturedAtUtc), timezone: gps.timezone } : null}
            />
          )}

          <Button
            className="w-full"
            style={{ background: canSubmit ? GOLD : "#333", color: canSubmit ? "#111111" : "#71717a" }}
            disabled={!canSubmit}
            onClick={submit}
          >
            {uploading || createScan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run AI Safety Scan"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
