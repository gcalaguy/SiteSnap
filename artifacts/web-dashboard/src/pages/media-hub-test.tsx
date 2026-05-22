import { useState, useRef } from "react";
import {
  useMediaHubPresignedUrl,
  useMediaHubSavePhoto,
  useListProjects,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Image } from "lucide-react";

export default function MediaHubTestPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [roomLocation, setRoomLocation] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "saving" | "done">("idle");
  const [savedPhoto, setSavedPhoto] = useState<
    | (Pick<import("@workspace/api-client-react").MediaHubPhoto, "id" | "imageUrl" | "roomLocation">)
    | null
  >(null);

  const { data: rawProjects = [] } = useListProjects();
  const projects = rawProjects.map((p) => ({ id: p.id, name: p.name }));

  const presigned = useMediaHubPresignedUrl();
  const savePhoto = useMediaHubSavePhoto();

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }
    if (!projectId) {
      toast({ title: "Select a project", variant: "destructive" });
      return;
    }

    try {
      setStatus("uploading");

      // 1) get presigned URL
      const { uploadURL, objectPath } = await presigned.mutateAsync({
        data: { fileType: file.type, fileName: file.name },
      });

      // 2) PUT file to object storage
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Object storage upload failed: ${putRes.status}`);
      }

      setStatus("saving");

      // 3) persist the photo record
      const photo = await savePhoto.mutateAsync({
        data: {
          projectId: Number(projectId),
          imageUrl: objectPath,
          roomLocation: roomLocation || null,
          markupData: null,
        },
      });

      setSavedPhoto(photo);
      setStatus("done");
      toast({ title: "Photo saved to Media Hub", description: `ID #${photo.id}` });
      if (fileRef.current) fileRef.current.value = "";
      setRoomLocation("");
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setStatus("idle");
    }
  };

  const busy = status === "uploading" || status === "saving";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Camera className="h-6 w-6 text-[#D4AF37]" />
        <h1 className="text-2xl font-bold text-[#121212]">Media Hub Test</h1>
      </div>
      <p className="text-sm text-gray-500">
        Upload a photo via the new presigned-URL pipeline and verify it lands in
        the database.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#D4AF37]">
            Upload Photo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-[#D4AF37]">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[#D4AF37]">Room / Location</Label>
            <Input
              value={roomLocation}
              onChange={(e) => setRoomLocation(e.target.value)}
              placeholder="e.g. Kitchen — north wall"
            />
          </div>

          <div>
            <Label className="text-[#D4AF37]">Photo file</Label>
            <Input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="cursor-pointer"
            />
          </div>

          <Button
            className="bg-[#D4AF37] text-white hover:bg-[#b5922e]"
            onClick={handleUpload}
            disabled={busy}
          >
            <Upload className="mr-2 h-4 w-4" />
            {status === "uploading"
              ? "Uploading to storage..."
              : status === "saving"
                ? "Saving record..."
                : "Upload & Save"}
          </Button>
        </CardContent>
      </Card>

      {savedPhoto && status === "done" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-green-700">
              Saved Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4 text-[#D4AF37]" />
              <span className="text-sm font-medium">Photo #{savedPhoto.id}</span>
              <Badge variant="outline" className="text-[10px]">
                {savedPhoto.roomLocation ?? "No location"}
              </Badge>
            </div>
            <div className="text-xs text-gray-500 break-all">
              {savedPhoto.imageUrl}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSavedPhoto(null);
                setStatus("idle");
              }}
            >
              Upload Another
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
