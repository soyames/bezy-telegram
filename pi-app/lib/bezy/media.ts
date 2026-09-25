"use client";

import {
  sanitizeMatchSummaries,
  sanitizeMatchSummary,
  sanitizeSharedPerson,
  sanitizeSocialMessages,
  type DatingPrefs,
  type DatingProfile,
  type MatchSummary,
  type Message,
  type ReportReason,
  type SharedPerson,
} from "@/lib/bezy/data";
import { AUTH_SCOPES } from "@/lib/pi";

// The backend holds private Vercel Blob objects. Authentication stays on Pi;
// each Vercel request is bound to a Pi token verified again by /v2/me.
const API = process.env.NEXT_PUBLIC_BEZY_API_URL || "https://bezy-api.vercel.app";
let tokenPromise: Promise<string> | null = null;

/** A discoverable person from the shared Bezy community (Pi or Telegram). */
export type Candidate = SharedPerson;

/** An API failure, carrying the HTTP status and the backend's machine-readable code. */
export interface ApiFailure extends Error {
  status: number;
  code: string;
}

async function token(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      if (!window.Pi) throw new Error("Open Bezy inside Pi Browser to use photos.");
      // The app's full scope list, shared with lib/pi.ts. Asking for less here would narrow
      // the Pi session for every other caller and take the payments scope with it.
      const result = await window.Pi.authenticate(AUTH_SCOPES, () => {});
      return result.accessToken;
    })().catch((error) => { tokenPromise = null; throw error; });
  }
  return tokenPromise;
}

/** Read the { error: 'CODE' } body every Bezy API failure carries. */
async function failureCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return body && typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
}

/**
 * The one authenticated call every Bezy API shares. `path` is the full path beneath the API
 * origin, so photo and community requests both bind to the same Pi token; a 401 clears the
 * cached token so the next call re-authenticates. `label` is what the user is told.
 */
async function request(
  path: string,
  init: RequestInit = {},
  label = "Photo service unavailable",
): Promise<Response> {
  const accessToken = await token();
  const response = await fetch(`${API}/${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Pi ${accessToken}` },
  });
  if (response.status === 401) tokenPromise = null;
  if (!response.ok) {
    const failure = new Error(`${label} (${response.status}).`) as ApiFailure;
    failure.status = response.status;
    failure.code = await failureCode(response);
    throw failure;
  }
  return response;
}

function json(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function syncMediaMember(photoConsent: boolean, discoverable: boolean, ensure = false) {
  await request("api/media/member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true, photoConsent, discoverable, ensure }),
  });
}

/**
 * Shrink a chosen photo in the browser before it is sent. The upload passes through a
 * serverless function, and Vercel aborts any request over ~4.5 MB before Bezy sees it, so
 * without this a member on a modern phone camera simply cannot add a photo. Downscaling
 * also keeps what other members download sane. Returns the original file when the browser
 * cannot decode it, so an unusual format still gets its chance at the API.
 */
export async function shrinkDatingPhoto(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("decode failed"));
      element.src = url;
    });
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, maxEdge / longest);
    if (scale === 1 && file.size <= 1_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadDatingPhoto(file: Blob): Promise<string> {
  const response = await request("api/media/photos", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  return (await response.json()).id as string;
}

export async function downloadDatingPhoto(id: string): Promise<Blob> {
  const response = await request(`api/media/photos?id=${encodeURIComponent(id)}`);
  return response.blob();
}

export async function removeDatingPhoto(id: string): Promise<void> {
  await request(`api/media/photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function removeAllDatingPhotos(): Promise<void> {
  await request("api/media/photos?all=1", { method: "DELETE" });
}

/* ---------- Pi payments (/api/pi) ---------- */

/** One purchasable plan, priced by the server so the browser cannot choose the amount. */
export interface PiPlan {
  id: string;
  pi: number;
  months: number;
}

/** What the server says this member owns. Premium is read from there, never asserted here. */
export interface PiEntitlement {
  active: boolean;
  expiresAt: number;
  plan: string | null;
}

export interface PiCheckout extends PiEntitlement {
  configured: boolean;
  plans: PiPlan[];
}

function paymentRequest(init: RequestInit = {}): Promise<Response> {
  return request("api/pi/payment", init, "Payments are unavailable right now");
}

/** Plans and the entitlement the server holds, in one call. */
export async function fetchPiCheckout(): Promise<PiCheckout> {
  const response = await paymentRequest();
  return (await response.json()) as PiCheckout;
}

export async function approvePiPayment(paymentId: string): Promise<void> {
  await paymentRequest(json({ action: "approve", paymentId }));
}

export async function completePiPayment(paymentId: string, txid: string): Promise<PiEntitlement> {
  const response = await paymentRequest(json({ action: "complete", paymentId, txid }));
  return (await response.json()) as PiEntitlement;
}

export async function cancelPiPayment(paymentId: string): Promise<void> {
  await paymentRequest(json({ action: "cancel", paymentId }));
}

/* ---------- shared community service (/api/social) ---------- */

const COMMUNITY_LABEL = "Couldn't reach Bezy's community service";

function socialRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return request(`api/social/${path}`, init, COMMUNITY_LABEL);
}

/**
 * Publish (or update) this account's dating profile and preferences to the shared backend.
 * Sent even while paused, because pausing is a preference the server needs to know about.
 */
export async function syncSocialProfile(profile: DatingProfile, prefs: DatingPrefs): Promise<boolean> {
  const response = await socialRequest("profile", json({
    adultConfirmed: true,
    profile: {
      displayName: profile.displayName,
      age: profile.age,
      gender: profile.gender,
      bio: profile.bio,
      interests: profile.interests,
      lookingFor: profile.lookingFor,
      area: profile.area,
      photoConsent: profile.photoConsent,
    },
    prefs: {
      interestedIn: prefs.interestedIn,
      ageMin: prefs.ageMin,
      ageMax: prefs.ageMax,
      widenArea: prefs.widenArea,
      visibility: prefs.visibility,
      whoCanMessage: prefs.whoCanMessage,
      paused: prefs.paused,
    },
  }));
  const body = (await response.json()) as { discoverable?: unknown };
  return body.discoverable === true;
}

/** Account deletion: removes the shared profile, decisions and matches on the backend. */
export async function removeSocialProfile(): Promise<void> {
  await socialRequest("profile", { method: "DELETE" });
}

/** The member's own profile as the backend holds it — the durable copy of who they are. */
export interface ServerSelfProfile {
  name: string;
  age: number;
  gender: string;
  area: string;
  bio: string;
  interests: string[];
  lookingFor: string;
  visibility: string;
  paused: boolean;
  photoConsent: boolean;
  prefs?: {
    interestedIn?: string[];
    ageMin?: number;
    ageMax?: number;
    widenArea?: boolean;
    whoCanMessage?: string;
  };
}

/**
 * Read this account's own profile back from Bezy's database. The frontend treats that copy
 * as authoritative, so a member whose device lost its storage is restored instead of being
 * sent through registration again.
 */
export async function fetchOwnSocialProfile(): Promise<ServerSelfProfile | null> {
  const response = await socialRequest("profile");
  const body = (await response.json()) as { profile?: unknown };
  const raw = body.profile;
  if (!raw || typeof raw !== "object") return null;
  return raw as ServerSelfProfile;
}

/** Real people the backend has matched to this account's filters (both sides applied). */
export async function fetchSocialDiscovery(): Promise<Candidate[]> {
  const response = await socialRequest("discover");
  const body = (await response.json()) as { candidates?: unknown };
  const raw = Array.isArray(body.candidates) ? body.candidates : [];
  const people: Candidate[] = [];
  for (const item of raw) {
    const person = sanitizeSharedPerson(item);
    if (person) people.push(person);
  }
  return people;
}

/** Everyone who already liked this account and hasn't been decided on yet (Premium). */
export async function fetchSocialLikes(): Promise<Candidate[]> {
  const response = await socialRequest("likes");
  const body = (await response.json()) as { likes?: unknown };
  const raw = Array.isArray(body.likes) ? body.likes : [];
  const people: Candidate[] = [];
  for (const item of raw) {
    const person = sanitizeSharedPerson(item);
    if (person) people.push(person);
  }
  return people;
}

export async function sendSocialDecision(
  target: string,
  decision: "like" | "pass",
): Promise<{ matched: boolean; match?: MatchSummary }> {
  const response = await socialRequest("decision", json({ target, decision }));
  const body = (await response.json()) as { matched?: unknown; match?: unknown };
  const match = sanitizeMatchSummary(body.match);
  return { matched: body.matched === true, match: match ?? undefined };
}

export async function fetchSocialMatches(): Promise<MatchSummary[]> {
  const response = await socialRequest("matches");
  const body = (await response.json()) as { matches?: unknown };
  return sanitizeMatchSummaries(body.matches);
}

export async function unmatchSocial(matchId: string): Promise<void> {
  await socialRequest("matches", json({ match: matchId, action: "unmatch" }));
}

/** Newest messages only: `afterMs` is the timestamp the client already has. */
export async function fetchSocialMessages(matchId: string, afterMs: number): Promise<Message[]> {
  const after = Math.max(0, Math.floor(afterMs));
  const response = await socialRequest(
    `messages?match=${encodeURIComponent(matchId)}&after=${after}`,
  );
  const body = (await response.json()) as { messages?: unknown };
  return sanitizeSocialMessages(body.messages);
}

/** `clientId` is the id the optimistic local copy already uses, so both sides agree. */
export async function sendSocialMessage(
  matchId: string,
  clientId: string,
  text: string,
): Promise<void> {
  await socialRequest("messages", json({ match: matchId, clientId, text }));
}

export async function markSocialRead(matchId: string): Promise<void> {
  await socialRequest("messages", json({ match: matchId, read: true }));
}

export async function blockSocial(target: string): Promise<void> {
  await socialRequest("block", json({ target }));
}

export async function unblockSocial(target: string): Promise<void> {
  await socialRequest("block", json({ target }, "DELETE"));
}

/** Reporting also blocks them server-side, so they can't reach the reporter again. */
export async function reportSocial(
  target: string,
  reason: ReportReason,
  note: string,
): Promise<void> {
  await socialRequest("report", json({ target, reason, note: note.trim().slice(0, 300) }));
}
