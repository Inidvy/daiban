// Small wrapper around localStorage: it can be missing or throw (private windows, blocked storage),
// so every read falls back to a default and every write is best-effort.

const PREFIX = 'daiban.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the game still works, it just won't remember
  }
}
