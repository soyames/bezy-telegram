"use client";
import { downloadDatingPhoto } from "@/lib/bezy/media";

// Photo bytes are persisted in private Vercel Blob and cached in IndexedDB.
// Pi userState stores photo IDs, never bytes. Accounts on the same device are isolated
// by the verified UID supplied by the authentication context.
const DB_NAME = "bezy-device-photos";
const STORE = "photos";
const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const urls = new Map<string, string>();
const subscribers = new Set<() => void>();
let account: string | null = null;

function emit() { subscribers.forEach((fn) => fn()); }

export function configurePhotoAccount(uid: string) {
  if (account === uid) return;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  account = uid;
  emit();
}

function key(photoId: string) {
  if (!account) throw new Error("Sign in before accessing photos");
  return `${account}:${photoId}`;
}

function openPhotos(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Device photo storage is unavailable"));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void): Promise<T> {
  const db = await openPhotos();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      run(tx.objectStore(STORE), (result) => { value = result; }, reject);
    });
  } finally {
    db.close();
  }
}

export function getPhotoUrl(id: string): string | undefined { return urls.get(id); }

/**
 * Cache an owner's selected photo on their device before saving its photo ID. Takes a
 * Blob because the bytes cached are the downscaled ones, not the file the member picked.
 */
export async function saveLocalPhoto(id: string, file: Blob) {
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_BYTES || !file.size) {
    throw new Error("Choose a JPEG, PNG or WebP photo under 8 MB.");
  }
  const storageKey = key(id);
  await transact<void>("readwrite", (store, resolve) => {
    const req = store.put(file, storageKey);
    req.onsuccess = () => resolve();
  });
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, URL.createObjectURL(file));
  emit();
}

/** Copies received from the authorized backend use the same device cache. */
export async function cacheViewedPhoto(ownerId: string, photoId: string, blob: Blob) {
  if (!ownerId || !photoId || !IMAGE_TYPES.has(blob.type) || !blob.size || blob.size > MAX_BYTES) {
    throw new Error("Invalid photo transfer");
  }
  const id = `${ownerId}:${photoId}`;
  const storageKey = key(id);
  await transact<void>("readwrite", (store, resolve) => {
    const req = store.put(blob, storageKey);
    req.onsuccess = () => resolve();
  });
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, URL.createObjectURL(blob));
  emit();
  return id;
}

export async function loadPhotoUrl(id: string): Promise<void> {
  const activeAccount = account;
  if (!activeAccount || urls.has(id)) return;
  let blob = await transact<Blob | undefined>("readonly", (store, resolve, reject) => {
    const req = store.get(key(id));
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  // A different device starts with an empty cache. Fetch through the authenticated
  // backend and save a local copy, with no photo bytes in the SQL database.
  if (!blob && /^[a-f\d-]{36}$/i.test(id)) {
    blob = await downloadDatingPhoto(id);
    if (account === activeAccount) {
      await transact<void>("readwrite", (store, resolve) => {
        const req = store.put(blob, key(id));
        req.onsuccess = () => resolve();
      });
    }
  }
  if (blob && account === activeAccount && !urls.has(id)) {
    urls.set(id, URL.createObjectURL(blob));
    emit();
  }
}

export async function clearPhotoUrl(id: string) {
  const storageKey = key(id);
  await transact<void>("readwrite", (store, resolve) => {
    const req = store.delete(storageKey);
    req.onsuccess = () => resolve();
  });
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.delete(id);
  emit();
}

/** Delete this signed-in account's local copies when they delete their account. */
export async function clearAccountPhotos() {
  if (!account) return;
  const prefix = `${account}:`;
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
  });
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  emit();
}

export function subscribePhotos(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/* ---------- photos of other people ---------- */

// One download per photo even when several cards ask for it at once.
const viewed = new Map<string, Promise<string>>();

/**
 * A photo belonging to someone else. Local copies come back instantly; otherwise the bytes
 * are fetched through the authenticated backend — which only serves a photo while its owner
 * is consented and discoverable — and cached under the owner's key like any other transfer.
 * Rejects when the photo can't be shown, so callers fall back to PhotoArt.
 */
export async function viewedPhotoUrl(ownerId: string, photoId: string): Promise<string> {
  const id = `${ownerId}:${photoId}`;
  const cached = urls.get(id);
  if (cached) return cached;
  const pending = viewed.get(id);
  if (pending) return pending;
  const task = transferViewedPhoto(id, ownerId, photoId).finally(() => {
    viewed.delete(id);
  });
  viewed.set(id, task);
  return task;
}

async function transferViewedPhoto(id: string, ownerId: string, photoId: string): Promise<string> {
  if (!account) throw new Error("Sign in before viewing photos");
  // Another session on this device may already hold the bytes under the owner's key.
  await loadPhotoUrl(id);
  const local = urls.get(id);
  if (local) return local;
  const blob = await downloadDatingPhoto(photoId);
  const stored = await cacheViewedPhoto(ownerId, photoId, blob);
  const url = urls.get(stored);
  if (!url) throw new Error("That photo isn't available on this device");
  return url;
}

/** Let go of the in-memory copy once a card is gone; the device cache keeps the bytes. */
export function releaseViewedPhoto(ownerId: string, photoId: string) {
  const id = `${ownerId}:${photoId}`;
  const url = urls.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  urls.delete(id);
  emit();
}
