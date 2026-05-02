let _signOut: (() => Promise<void>) | null = null;

export function setSignOut(fn: () => Promise<void>): void {
  _signOut = fn;
}

export async function signOut(): Promise<void> {
  if (_signOut) {
    await _signOut();
  }
}
