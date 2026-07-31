/**
 * scanPhotoHistoryHidden.ts
 *
 * Per-device, per-user "hide from Photo History" for AI Safety Scan entries.
 * Hiding a scan here only affects what this device shows in the mobile Photo
 * History screen — it never calls the server, so the scan stays fully visible
 * on the Web Dashboard and on any other device signed into the same account.
 *
 * Keyed by user id so multiple accounts sharing one device don't affect each
 * other's hidden lists.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "hidden_safety_scans_v1";

function keyFor(userId: number): string {
  return `${KEY_PREFIX}:${userId}`;
}

export async function getHiddenScanIds(userId: number): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

export async function hideScanId(userId: number, scanId: number): Promise<void> {
  const existing = await getHiddenScanIds(userId);
  const next = Array.from(new Set([...existing, scanId]));
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
}
