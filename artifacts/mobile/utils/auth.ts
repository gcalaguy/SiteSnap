let _signOut: (() => Promise<void>) | null = null;
let _tokenGetter: (() => Promise<string | null>) | null = null;

export function setSignOut(fn: () => Promise<void>): void {
  _signOut = fn;
}

export async function signOut(): Promise<void> {
  if (_signOut) {
    await _signOut();
  }
}

export function setTokenGetter(fn: () => Promise<string | null>): void {
  _tokenGetter = fn;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return _tokenGetter ? await _tokenGetter() : null;
  } catch {
    return null;
  }
}

// ── Current signed-in user id ────────────────────────────────────────────────
// Single source of truth for "whose device session is this," set from the
// Clerk user id by app/_layout.tsx as soon as auth resolves. Offline queue
// modules (utils/offlineQueue.ts, context/*QueueContext.tsx) key their
// AsyncStorage entries off this id so a second account signing in on the
// same device never sees, syncs, or overwrites another account's queued
// offline work (safety forms, notes, media, daily reports) under its own
// session/tenant.
let _currentUserId: string | null = null;
type UserIdListener = (id: string | null) => void;
const _userIdListeners = new Set<UserIdListener>();

export function setCurrentUserId(id: string | null): void {
  _currentUserId = id;
  _userIdListeners.forEach((fn) => fn(id));
}

export function getCurrentUserId(): string | null {
  return _currentUserId;
}

/** Subscribe to user-id changes (sign-in/sign-out/account switch). Returns an unsubscribe function. */
export function onCurrentUserIdChange(fn: UserIdListener): () => void {
  _userIdListeners.add(fn);
  return () => { _userIdListeners.delete(fn); };
}
