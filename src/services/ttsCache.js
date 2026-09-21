/** Short-lived in-memory store for generated TTS audio, served once to the overlay page then left to expire. */

const store = new Map(); // id -> { buffer, expiresAt }

export function storeAudio(buffer, ttlMs = 3 * 60_000) {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set(id, { buffer, expiresAt: Date.now() + ttlMs });
  return id;
}

export function getAudio(id) {
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(id);
    return null;
  }
  return entry.buffer;
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt < now) store.delete(id);
  }
}, 60_000);
sweep.unref?.();
