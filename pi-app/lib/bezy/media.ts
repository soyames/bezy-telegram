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
      const result = await window.Pi.authenticate(["username"], () => {});
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

export async function uploadDatingPhoto(file: File): Promise<string> {
  const response = await request("api/media/photos", {
    method: "POST",
    headers: { "Content-Type": file.type },
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
