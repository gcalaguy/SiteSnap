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
