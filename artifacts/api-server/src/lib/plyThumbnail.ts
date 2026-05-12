/**
 * Server-side PLY point-cloud thumbnail generator.
 *
 * Downloads up to the first 512 KB of a .ply file from object storage,
 * parses XYZ vertex positions (ASCII or binary little-endian float32),
 * renders a 128×128 top-down orthographic projection, and returns a PNG
 * Buffer ready for upload.  Returns null on any parse/render failure so
 * callers can silently skip thumbnail generation.
 */

import { PNG } from "pngjs";

const THUMB_SIZE = 128;
const MAX_READ_BYTES = 512 * 1024; // 512 KB
const MAX_POINTS = 4_000;

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Byte sizes for each PLY scalar type. */
const PLY_TYPE_SIZE: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4,
  double: 8, float64: 8,
};

interface PlyProperty {
  name: string;
  byteSize: number;
  byteOffset: number; // byte offset from start of vertex record
  isFloat: boolean;
}

interface PlyHeaderInfo {
  headerEndOffset: number;
  vertexCount: number;
  isBinary: boolean;
  vertexStride: number; // total bytes per vertex
  xProp: PlyProperty | null;
  yProp: PlyProperty | null;
  zProp: PlyProperty | null;
  /** ASCII column index (same as property declaration order) */
  xColIdx: number;
  yColIdx: number;
  zColIdx: number;
}

function parsePlyHeader(text: string): PlyHeaderInfo | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "ply") return null;

  let isBinary = false;
  let vertexCount = 0;
  let inVertex = false;
  let byteOffset = 0;
  let colIdx = 0;
  const props: PlyProperty[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "end_header") {
      const endHeaderIdx = text.indexOf("end_header") + "end_header".length;
      let off = endHeaderIdx;
      if (text[off] === "\r") off++;
      if (text[off] === "\n") off++;
      if (vertexCount <= 0) return null;

      const xProp = props.find((p) => p.name === "x") ?? null;
      const yProp = props.find((p) => p.name === "y") ?? null;
      const zProp = props.find((p) => p.name === "z") ?? null;
      if (!xProp || !yProp || !zProp) return null;

      const xColIdx = props.indexOf(xProp);
      const yColIdx = props.indexOf(yProp);
      const zColIdx = props.indexOf(zProp);

      return {
        headerEndOffset: off,
        vertexCount,
        isBinary,
        vertexStride: byteOffset,
        xProp,
        yProp,
        zProp,
        xColIdx,
        yColIdx,
        zColIdx,
      };
    }

    if (trimmed.startsWith("format binary")) isBinary = true;

    if (trimmed.startsWith("element vertex")) {
      vertexCount = parseInt(trimmed.split(/\s+/)[2] ?? "0", 10);
      inVertex = true;
      byteOffset = 0;
      colIdx = 0;
      props.length = 0;
    } else if (trimmed.startsWith("element ") && !trimmed.startsWith("element vertex")) {
      inVertex = false;
    }

    if (inVertex && trimmed.startsWith("property ") && !trimmed.startsWith("property list")) {
      const parts = trimmed.split(/\s+/);
      const typeName = parts[1] ?? "";
      const propName = parts[2] ?? "";
      const size = PLY_TYPE_SIZE[typeName] ?? 4;
      props.push({
        name: propName,
        byteSize: size,
        byteOffset,
        isFloat: typeName === "float" || typeName === "float32",
        });
      byteOffset += size;
      colIdx++;
    }
  }
  return null;
}

function readBinaryProp(buf: Buffer, bytePos: number, prop: PlyProperty): number {
  if (prop.isFloat) return buf.readFloatLE(bytePos);
  // Support integer positions too (cast to float)
  switch (prop.byteSize) {
    case 8: return buf.readDoubleBE(bytePos); // big-endian double rare but handle
    case 2: return buf.readInt16LE(bytePos);
    case 1: return buf.readUInt8(bytePos);
    default: return buf.readInt32LE(bytePos);
  }
}

function sampleAsciiPoints(body: string, info: PlyHeaderInfo): Point3[] {
  const { vertexCount, xColIdx, yColIdx, zColIdx } = info;
  const points: Point3[] = [];
  const step = Math.max(1, Math.floor(vertexCount / MAX_POINTS));
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, vertexCount); i += step) {
    const parts = lines[i]?.trim().split(/\s+/) ?? [];
    const x = parseFloat(parts[xColIdx] ?? "");
    const y = parseFloat(parts[yColIdx] ?? "");
    const z = parseFloat(parts[zColIdx] ?? "");
    if (isFinite(x) && isFinite(y) && isFinite(z)) points.push({ x, y, z });
  }
  return points;
}

function sampleBinaryPoints(buf: Buffer, dataOffset: number, info: PlyHeaderInfo): Point3[] {
  const { vertexCount, vertexStride, xProp, yProp, zProp } = info;
  if (!xProp || !yProp || !zProp || vertexStride <= 0) return [];
  const points: Point3[] = [];
  const step = Math.max(1, Math.floor(vertexCount / MAX_POINTS));
  for (let i = 0; i < vertexCount; i += step) {
    const base = dataOffset + i * vertexStride;
    if (base + vertexStride > buf.length) break;
    const x = readBinaryProp(buf, base + xProp.byteOffset, xProp);
    const y = readBinaryProp(buf, base + yProp.byteOffset, yProp);
    const z = readBinaryProp(buf, base + zProp.byteOffset, zProp);
    if (isFinite(x) && isFinite(y) && isFinite(z)) points.push({ x, y, z });
  }
  return points;
}

function renderToPng(points: Point3[]): Buffer | null {
  if (points.length === 0) return null;

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const rangeX = maxX - minX || 1;
  const rangeZ = maxZ - minZ || 1;

  const png = new PNG({ width: THUMB_SIZE, height: THUMB_SIZE });

  // Fill background: dark navy gradient (#0f172a -> #1e1b4b approximated)
  for (let y = 0; y < THUMB_SIZE; y++) {
    for (let x = 0; x < THUMB_SIZE; x++) {
      const idx = (y * THUMB_SIZE + x) * 4;
      const t = (x + y) / (THUMB_SIZE * 2);
      png.data[idx] = Math.round(15 + t * 15);     // R
      png.data[idx + 1] = Math.round(23 + t * 4);  // G
      png.data[idx + 2] = Math.round(42 + t * 33); // B
      png.data[idx + 3] = 255;
    }
  }

  // Plot each sampled point as a 2×2 cyan-ish dot
  const pad = 6;
  const size = THUMB_SIZE - pad * 2;
  for (const p of points) {
    const px = Math.round(pad + ((p.x - minX) / rangeX) * size);
    const pz = Math.round(pad + ((p.z - minZ) / rangeZ) * size);
    const t = (p.x - minX) / rangeX;
    const r = Math.round(80 + t * 100);
    const g = Math.round(130 + (1 - t) * 60);
    const b = 220;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const cx = px + dx;
        const cy = pz + dy;
        if (cx >= 0 && cx < THUMB_SIZE && cy >= 0 && cy < THUMB_SIZE) {
          const idx = (cy * THUMB_SIZE + cx) * 4;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 217; // ~0.85 opacity
        }
      }
    }
  }

  return PNG.sync.write(png);
}

/**
 * Download first MAX_READ_BYTES of the scan's .ply file, parse it, and return a PNG
 * buffer representing a 128×128 top-down point-cloud projection.
 *
 * @param signedUrl  A short-lived signed read URL for the .ply object
 * @returns  PNG Buffer, or null if generation fails for any reason
 */
export async function generatePlyThumbnailFromUrl(signedUrl: string): Promise<Buffer | null> {
  try {
    const response = await fetch(signedUrl, {
      headers: { Range: `bytes=0-${MAX_READ_BYTES - 1}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 206) return null;

    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    // Parse header from the first 4 KB as text
    const headerText = buf.slice(0, Math.min(buf.length, 4096)).toString("utf8");
    const info = parsePlyHeader(headerText);
    if (!info) return null;

    let points: Point3[];
    if (info.isBinary) {
      points = sampleBinaryPoints(buf, info.headerEndOffset, info);
    } else {
      const fullText = buf.toString("utf8");
      const body = fullText.slice(info.headerEndOffset);
      points = sampleAsciiPoints(body, info);
    }

    return renderToPng(points);
  } catch {
    return null;
  }
}
