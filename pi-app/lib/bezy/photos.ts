"use client";

// In-session object URLs for user-added photos. Real image bytes exceed the durable
// per-user storage budget, so only lightweight PhotoRef descriptors ({ id, hue }) are
// persisted. During a session we keep the object URL here so the actual picture shows;
// on reload a warm gradient placeholder stands in until the photo is re-added.

const urls = new Map<string, string>();
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => fn());
}

export function setPhotoUrl(id: string, url: string) {
  urls.set(id, url);
  emit();
}

export function getPhotoUrl(id: string): string | undefined {
  return urls.get(id);
}

export function clearPhotoUrl(id: string) {
  const existing = urls.get(id);
  if (existing) {
    try {
      URL.revokeObjectURL(existing);
    } catch {
      /* ignore */
    }
  }
  urls.delete(id);
  emit();
}

export function subscribePhotos(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
