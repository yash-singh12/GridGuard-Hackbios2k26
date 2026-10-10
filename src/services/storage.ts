/**
 * Safe localStorage access with availability detection.
 * When the browser blocks site data (private mode, blocked cookies, file://),
 * every read/write throws — callers fall back to in-memory state and the UI
 * shows a persistence warning instead of silently losing data on refresh.
 */

let availabilityCache: boolean | null = null;

export function isLocalStorageAvailable(): boolean {
  if (availabilityCache !== null) return availabilityCache;
  try {
    const probe = '__gridguard_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    availabilityCache = true;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    availabilityCache = false;
    return null;
  }
}

export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    availabilityCache = false;
    return false;
  }
}
