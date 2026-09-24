"use client";

// The backend holds private Vercel Blob objects. Authentication stays on Pi;
// each Vercel request is bound to a Pi token verified again by /v2/me.
const API = process.env.NEXT_PUBLIC_BEZY_API_URL || "https://bezy-telegram.vercel.app";
let tokenPromise: Promise<string> | null = null;

async function token(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      if (!window.Pi) throw new Error("Open Bezy inside Pi Browser to use photos.");
      const result = await window.Pi.authenticate(["username"], () => {});
      return result.accessToken;
    })().catch((error) => { tokenPromise = null; throw error; });
  }
  return tokenPromise;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await token();
  const response = await fetch(`${API}/api/media/${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Pi ${accessToken}` },
  });
  if (response.status === 401) tokenPromise = null;
  if (!response.ok) throw new Error(`Photo service unavailable (${response.status}).`);
  return response;
}

export async function syncMediaMember(photoConsent: boolean, discoverable: boolean, ensure = false) {
  await request("member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true, photoConsent, discoverable, ensure }),
  });
}

export async function uploadDatingPhoto(file: File): Promise<string> {
  const response = await request("photos", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  return (await response.json()).id as string;
}

export async function downloadDatingPhoto(id: string): Promise<Blob> {
  const response = await request(`photos?id=${encodeURIComponent(id)}`);
  return response.blob();
}

export async function removeDatingPhoto(id: string): Promise<void> {
  await request(`photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function removeAllDatingPhotos(): Promise<void> {
  await request("photos?all=1", { method: "DELETE" });
}
