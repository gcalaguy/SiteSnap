import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { getAuthToken } from "@/utils/auth";

export function fileDownloadUrl(objectPath: string): string {
  const base = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
  return `${base}${objectPath.replace(/^\/objects\//, "/api/storage/objects/")}`;
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "xlsx" || ext === "xls")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "docx" || ext === "doc")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "csv") return "text/csv";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

export async function openStorageFile(
  objectPath: string,
  filename: string,
  fileType?: string | null
): Promise<void> {
  const url = fileDownloadUrl(objectPath);
  const token = await getAuthToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const safeFilename = (filename ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const localUri = `${FileSystem.cacheDirectory}${Date.now()}_${safeFilename}`;

  try {
    const result = await FileSystem.downloadAsync(url, localUri, { headers });

    if (result.status >= 400) {
      Alert.alert("Cannot open file", "Access denied or file not found.");
      return;
    }

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert("Sharing not available", "Cannot open files on this device.");
      return;
    }

    const mimeType = fileType || mimeFromFilename(safeFilename);
    await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: safeFilename });
  } catch {
    Alert.alert("Error", "Could not download the file. Please try again.");
  }
}
