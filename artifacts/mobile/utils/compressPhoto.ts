import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.75;

export interface CompressedPhoto {
  uri: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Resizes a picked photo to a max width of 1920px and re-encodes it as a
 * quality-0.75 JPEG before it's read into memory / uploaded. Falls back to
 * the original file (with its already-known size/mimeType) if manipulation
 * fails, so a bad frame never blocks the capture flow.
 */
export async function compressPhoto(
  uri: string,
  original: { mimeType?: string; fileSize?: number },
): Promise<CompressedPhoto> {
  try {
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    const info = await FileSystem.getInfoAsync(compressed.uri);
    return {
      uri: compressed.uri,
      mimeType: "image/jpeg",
      fileSize: info.exists && "size" in info ? (info.size ?? 0) : 0,
    };
  } catch {
    return {
      uri,
      mimeType: original.mimeType ?? "image/jpeg",
      fileSize: original.fileSize ?? 0,
    };
  }
}
