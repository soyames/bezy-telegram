// Pure data + domain logic for Bezy. No React, safe to import anywhere.

export type Gender = "woman" | "man" | "nonbinary";
export type LookingFor = "long_term" | "casual" | "friends" | "open";
export type Visibility = "everyone" | "matches_only" | "hidden";
export type WhoCanMessage = "matches" | "everyone";
export type ReportReason =
  | "fake"
  | "harassment"
  | "inappropriate"
  | "underage"
  | "other";
export type ModAction = "dismiss" | "warn" | "hide" | "suspend";

export const GENDERS: { id: Gender; label: string }[] = [
  { id: "woman", label: "Woman" },
  { id: "man", label: "Man" },
  { id: "nonbinary", label: "Nonbinary" },
];

export const LOOKING_FOR: { id: LookingFor; label: string; blurb: string }[] = [
  { id: "long_term", label: "Long-term", blurb: "Hoping for something lasting" },
  { id: "casual", label: "Casual", blurb: "Keeping things light for now" },
  { id: "friends", label: "New friends", blurb: "Open to friendship first" },
  { id: "open", label: "Let's see", blurb: "Still figuring it out" },
];

export const AREAS: string[] = [
  "Greater London",
  "Manchester area",
  "Greater Paris",
  "Berlin area",
  "Lagos metro",
  "Nairobi area",
  "New York City area",
  "Los Angeles area",
  "Toronto area",
  "Sydney area",
  "Mumbai area",
  "São Paulo area",
];

export const INTERESTS: string[] = [
  "Hiking",
  "Coffee",
  "Live music",
  "Cooking",
  "Travel",
  "Reading",
  "Art",
  "Fitness",
  "Gaming",
  "Photography",
  "Dancing",
  "Films",
  "Foodie",
  "Yoga",
  "Startups",
  "Volunteering",
  "Dogs",
  "Cats",
  "Board games",
  "Astronomy",
];

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "fake", label: "Fake profile" },
  { id: "harassment", label: "Harassment" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "underage", label: "Appears underage" },
  { id: "other", label: "Something else" },
];

export const VISIBILITY: { id: Visibility; label: string; desc: string }[] = [
  {
    id: "everyone",
    label: "Everyone I match with in discovery",
    desc: "People who fit both of your preferences can find you.",
  },
  {
    id: "matches_only",
    label: "Only people I've already matched with",
    desc: "You won't appear to new people, but current matches still see you.",
  },
  {
    id: "hidden",
    label: "Hidden from everyone",
    desc: "You're not shown in discovery at all.",
  },
];

export const WHO_CAN_MESSAGE: { id: WhoCanMessage; label: string; desc: string }[] = [
  {
    id: "matches",
    label: "Only my matches",
    desc: "Just people you've mutually liked can start a conversation.",
  },
  {
    id: "everyone",
    label: "Anyone who can see me",
    desc: "People who can discover you may reach out first.",
  },
];

export const REASON_LABEL: Record<ReportReason, string> = {
  fake: "Fake profile",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  underage: "Appears underage",
  other: "Something else",
};

export const MOD_ACTION_LABEL: Record<ModAction, string> = {
  dismiss: "Dismissed",
  warn: "Warned",
  hide: "Profile hidden",
  suspend: "Account suspended",
};

export const MIN_AGE = 18;
export const MAX_AGE = 80;
export const MAX_PHOTOS = 4;
export const MAX_BIO = 400;
export const MAX_INTERESTS = 8;
export const MAX_MESSAGE = 800;
export const MAX_MESSAGES_PER_THREAD = 80;
export const MAX_REPORTS = 60;
export const MAX_MOD_ACTIONS = 80;

// ---------- Bezy Premium ----------

export const PREMIUM_DAYS = 30;
export const PREMIUM_MS = PREMIUM_DAYS * 24 * 60 * 60 * 1000;

export interface PremiumState {
  active: boolean;
  expiresAt: number;
  purchasedAt: number;
  lastPaymentId: string;
  lastTxid: string;
}

export interface PhotoRef {
  id: string;
  hue: number;
}

export interface DatingProfile {
  displayName: string;
  age: number;
  gender: Gender | "";
  bio: string;
  interests: string[];
  lookingFor: LookingFor;
  area: string;
  photos: PhotoRef[];
  photoConsent: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DatingPrefs {
  interestedIn: Gender[];
  ageMin: number;
  ageMax: number;
  widenArea: boolean;
  visibility: Visibility;
  whoCanMessage: WhoCanMessage;
  paused: boolean;
}

export interface ConsentState {
  adult: boolean;
  agreed: boolean;
  onboarded: boolean;
  at: number;
}

export interface DecisionState {
  likes: string[];
  passes: string[];
}

export interface Match {
  id: string;
  profileId: string;
  createdAt: number;
  seenMoment: boolean;
}

export interface Message {
  id: string;
  from: "me" | "them";
  text: string;
  at: number;
}

export interface ThreadsState {
  byMatch: Record<string, Message[]>;
  read: Record<string, number>; // matchId -> last read timestamp
  greeted: string[]; // matchIds where the respect guard was acknowledged
}

export interface Report {
  id: string;
  profileId: string;
  profileName: string;
  reason: ReportReason;
  note: string;
  status: "open" | "resolved";
  action: ModAction | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface ModActionLog {
  id: string;
  reportId: string;
  profileName: string;
  action: ModAction;
  at: number;
}

export interface SafetyRecord {
  id: string;
  profileId: string;
  profileName: string;
  reason: "unmatch";
  messageCount: number;
  lastMessages: string[];
  at: number;
}

// The shape of a discoverable Pioneer's profile card. Bezy's storage is scoped privately
// per Pi account with no shared, cross-account data store yet, so there is currently no
// real pool of other Pioneers for this array to hold. It stays empty — intentionally, not
// as a placeholder for fake people — until a shared backend can supply real candidates.
export interface SeedProfile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  interestedIn: Gender[];
  ageMin: number;
  ageMax: number;
  area: string;
  interests: string[];
  lookingFor: LookingFor;
  bio: string;
  hueA: number;
  hueB: number;
}

export const SEED_PROFILES: SeedProfile[] = [];

// ---------- helpers ----------

export function genderLabel(g: Gender | ""): string {
  return GENDERS.find((x) => x.id === g)?.label ?? "Not set";
}

export function lookingForLabel(l: LookingFor): string {
  return LOOKING_FOR.find((x) => x.id === l)?.label ?? "Open";
}

export function reasonLabel(r: ReportReason): string {
  return REPORT_REASONS.find((x) => x.id === r)?.label ?? "Other";
}

export function makeId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hueFor(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function relativeTime(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return dateLabel(at);
}

export function dateLabel(at: number): string {
  try {
    return new Date(at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function dayLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  try {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function clockLabel(at: number): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function profileComplete(p: DatingProfile | null): boolean {
  if (!p) return false;
  return (
    p.displayName.trim().length >= 2 &&
    p.age >= MIN_AGE &&
    p.gender !== "" &&
    p.bio.trim().length >= 10 &&
    p.interests.length >= 1 &&
    p.area.trim().length > 0
  );
}

export function sharedInterests(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

export interface DiscoveryContext {
  profile: DatingProfile;
  prefs: DatingPrefs;
  likes: Set<string>;
  passes: Set<string>;
  matchedIds: Set<string>;
  blocked: Set<string>;
  reported: Set<string>;
}

/**
 * Both-sides discovery: a candidate appears only when the viewer's filters AND the
 * candidate's own preferences and visibility are all satisfied. Excludes blocked,
 * passed, matched, and reported profiles. Ranked by shared interests then age closeness.
 */
export function buildDiscovery(ctx: DiscoveryContext): SeedProfile[] {
  const { profile, prefs, likes, passes, matchedIds, blocked, reported } = ctx;
  const viewerGender = profile.gender;
  if (viewerGender === "") return [];

  const candidates = SEED_PROFILES.filter((c) => {
    if (likes.has(c.id) || passes.has(c.id)) return false;
    if (matchedIds.has(c.id) || blocked.has(c.id) || reported.has(c.id)) return false;

    // Viewer-side filters.
    if (!prefs.interestedIn.includes(c.gender)) return false;
    if (c.age < prefs.ageMin || c.age > prefs.ageMax) return false;
    if (!prefs.widenArea && c.area !== profile.area) return false;

    // Candidate-side rules (enforced from their side too).
    if (!c.interestedIn.includes(viewerGender)) return false;
    if (profile.age < c.ageMin || profile.age > c.ageMax) return false;

    return true;
  });

  return candidates.sort((a, b) => {
    const sa = sharedInterests(profile.interests, a.interests);
    const sb = sharedInterests(profile.interests, b.interests);
    if (sb !== sa) return sb - sa;
    const da = Math.abs(a.age - profile.age);
    const db = Math.abs(b.age - profile.age);
    return da - db;
  });
}

// ---------- defaults ----------

export function emptyProfile(): DatingProfile {
  return {
    displayName: "",
    age: 0,
    gender: "",
    bio: "",
    interests: [],
    lookingFor: "open",
    area: AREAS[0],
    photos: [],
    photoConsent: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function defaultPrefs(): DatingPrefs {
  return {
    interestedIn: ["woman", "man", "nonbinary"],
    ageMin: 18,
    ageMax: 45,
    widenArea: false,
    visibility: "everyone",
    whoCanMessage: "matches",
    paused: false,
  };
}

export function emptyConsent(): ConsentState {
  return { adult: false, agreed: false, onboarded: false, at: 0 };
}

export function emptyPremium(): PremiumState {
  return { active: false, expiresAt: 0, purchasedAt: 0, lastPaymentId: "", lastTxid: "" };
}

/** Whether a Premium period is currently unlocked (survives an expired flag left set). */
export function isPremiumActive(p: PremiumState, now = Date.now()): boolean {
  return p.active && p.expiresAt > now;
}

export function premiumExpiryLabel(expiresAt: number): string {
  if (!expiresAt) return "";
  try {
    return new Date(expiresAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// ---------- sanitizers (loaded state is untrusted) ----------

type AnyRec = Record<string, unknown>;

export function extractObject(rec: unknown): AnyRec | null {
  if (!rec || typeof rec !== "object") return null;
  const maybe = rec as AnyRec;
  const blob = maybe.blob;
  if (blob && typeof blob === "object") return blob as AnyRec;
  return maybe;
}

function cleanStr(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, (c) => (c === "\n" || c === "\t" ? c : " ")).slice(0, max);
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolOf(v: unknown): boolean {
  return v === true;
}

function strArray(v: unknown, allowed: string[] | null, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = cleanStr(item, 40);
    if (!s) continue;
    if (allowed && !allowed.includes(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const GENDER_IDS = GENDERS.map((g) => g.id);
const LOOKING_IDS = LOOKING_FOR.map((l) => l.id);

function pickGender(v: unknown): Gender | "" {
  const s = cleanStr(v, 20);
  return (GENDER_IDS as string[]).includes(s) ? (s as Gender) : "";
}

export function sanitizePhotos(v: unknown): PhotoRef[] {
  if (!Array.isArray(v)) return [];
  const out: PhotoRef[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const rec = item as AnyRec;
    const id = cleanStr(rec.id, 60);
    if (!id) continue;
    out.push({ id, hue: Math.max(0, Math.min(359, Math.round(toNum(rec.hue, hueFor(id))))) });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

export function sanitizeProfile(rec: unknown): DatingProfile | null {
  const o = extractObject(rec);
  if (!o) return null;
  const displayName = cleanStr(o.displayName, 40);
  if (!displayName) return null;
  const gender = pickGender(o.gender);
  const lookingForRaw = cleanStr(o.lookingFor, 20);
  const lookingFor = (LOOKING_IDS as string[]).includes(lookingForRaw)
    ? (lookingForRaw as LookingFor)
    : "open";
  const area = AREAS.includes(cleanStr(o.area, 40)) ? cleanStr(o.area, 40) : AREAS[0];
  return {
    displayName,
    age: Math.max(0, Math.min(MAX_AGE, Math.round(toNum(o.age)))),
    gender,
    bio: cleanStr(o.bio, MAX_BIO),
    interests: strArray(o.interests, INTERESTS, MAX_INTERESTS),
    lookingFor,
    area,
    photos: sanitizePhotos(o.photos),
    photoConsent: boolOf(o.photoConsent),
    createdAt: toNum(o.createdAt, Date.now()),
    updatedAt: toNum(o.updatedAt, Date.now()),
  };
}

export function sanitizePrefs(rec: unknown): DatingPrefs {
  const o = extractObject(rec);
  const d = defaultPrefs();
  if (!o) return d;
  const interestedIn = strArray(o.interestedIn, GENDER_IDS, 3) as Gender[];
  const visRaw = cleanStr(o.visibility, 20);
  const visibility: Visibility = ["everyone", "matches_only", "hidden"].includes(visRaw)
    ? (visRaw as Visibility)
    : "everyone";
  const msgRaw = cleanStr(o.whoCanMessage, 20);
  const whoCanMessage: WhoCanMessage = ["matches", "everyone"].includes(msgRaw)
    ? (msgRaw as WhoCanMessage)
    : "matches";
  let ageMin = Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(toNum(o.ageMin, 18))));
  let ageMax = Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(toNum(o.ageMax, 45))));
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];
  return {
    interestedIn: interestedIn.length ? interestedIn : d.interestedIn,
    ageMin,
    ageMax,
    widenArea: boolOf(o.widenArea),
    visibility,
    whoCanMessage,
    paused: boolOf(o.paused),
  };
}

export function sanitizeConsent(rec: unknown): ConsentState {
  const o = extractObject(rec);
  if (!o) return emptyConsent();
  return {
    adult: boolOf(o.adult),
    agreed: boolOf(o.agreed),
    onboarded: boolOf(o.onboarded),
    at: toNum(o.at, 0),
  };
}

export function sanitizePremium(rec: unknown): PremiumState {
  const o = extractObject(rec);
  if (!o) return emptyPremium();
  return {
    active: boolOf(o.active),
    expiresAt: Math.max(0, toNum(o.expiresAt, 0)),
    purchasedAt: Math.max(0, toNum(o.purchasedAt, 0)),
    lastPaymentId: cleanStr(o.lastPaymentId, 120),
    lastTxid: cleanStr(o.lastTxid, 120),
  };
}

function idList(v: unknown, max = 400): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = cleanStr(item, 60);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeDecisions(rec: unknown): DecisionState {
  const o = extractObject(rec);
  if (!o) return { likes: [], passes: [] };
  return { likes: idList(o.likes), passes: idList(o.passes) };
}

export function sanitizeMatches(rec: unknown): Match[] {
  const o = extractObject(rec);
  if (!o || !Array.isArray(o.items)) return [];
  const out: Match[] = [];
  for (const item of o.items) {
    if (!item || typeof item !== "object") continue;
    const r = item as AnyRec;
    const id = cleanStr(r.id, 60);
    const profileId = cleanStr(r.profileId, 60);
    if (!id || !profileId) continue;
    out.push({
      id,
      profileId,
      createdAt: toNum(r.createdAt, Date.now()),
      seenMoment: boolOf(r.seenMoment),
    });
    if (out.length >= 200) break;
  }
  return out;
}

export function sanitizeThreads(rec: unknown): ThreadsState {
  const o = extractObject(rec);
  const empty: ThreadsState = { byMatch: {}, read: {}, greeted: [] };
  if (!o) return empty;
  const byMatch: Record<string, Message[]> = {};
  const src = o.byMatch;
  if (src && typeof src === "object") {
    for (const [matchId, arr] of Object.entries(src as AnyRec)) {
      const key = cleanStr(matchId, 60);
      if (!key || !Array.isArray(arr)) continue;
      const msgs: Message[] = [];
      for (const m of arr) {
        if (!m || typeof m !== "object") continue;
        const mr = m as AnyRec;
        const id = cleanStr(mr.id, 60);
        const text = cleanStr(mr.text, MAX_MESSAGE);
        if (!id || !text) continue;
        msgs.push({
          id,
          from: mr.from === "me" ? "me" : "them",
          text,
          at: toNum(mr.at, Date.now()),
        });
        if (msgs.length >= MAX_MESSAGES_PER_THREAD) break;
      }
      byMatch[key] = msgs;
    }
  }
  const read: Record<string, number> = {};
  if (o.read && typeof o.read === "object") {
    for (const [k, v] of Object.entries(o.read as AnyRec)) {
      const key = cleanStr(k, 60);
      if (key) read[key] = toNum(v, 0);
    }
  }
  return { byMatch, read, greeted: idList(o.greeted, 200) };
}

const REASON_IDS = REPORT_REASONS.map((r) => r.id);
const ACTION_IDS: ModAction[] = ["dismiss", "warn", "hide", "suspend"];

export function sanitizeReports(rec: unknown): Report[] {
  const o = extractObject(rec);
  if (!o || !Array.isArray(o.items)) return [];
  const out: Report[] = [];
  for (const item of o.items) {
    if (!item || typeof item !== "object") continue;
    const r = item as AnyRec;
    const id = cleanStr(r.id, 60);
    const profileId = cleanStr(r.profileId, 60);
    if (!id || !profileId) continue;
    const reasonRaw = cleanStr(r.reason, 20);
    const reason = (REASON_IDS as string[]).includes(reasonRaw)
      ? (reasonRaw as ReportReason)
      : "other";
    const actionRaw = cleanStr(r.action, 20);
    const action = (ACTION_IDS as string[]).includes(actionRaw)
      ? (actionRaw as ModAction)
      : null;
    out.push({
      id,
      profileId,
      profileName: cleanStr(r.profileName, 40) || "Someone",
      reason,
      note: cleanStr(r.note, 300),
      status: r.status === "resolved" ? "resolved" : "open",
      action,
      createdAt: toNum(r.createdAt, Date.now()),
      resolvedAt: r.resolvedAt == null ? null : toNum(r.resolvedAt, 0),
    });
    if (out.length >= MAX_REPORTS) break;
  }
  return out;
}

export const MAX_SAFETY = 40;

export function sanitizeIds(rec: unknown): string[] {
  const o = extractObject(rec);
  if (!o) return [];
  return idList(o.ids, 400);
}

export function sanitizeSafety(rec: unknown): SafetyRecord[] {
  const o = extractObject(rec);
  if (!o || !Array.isArray(o.items)) return [];
  const out: SafetyRecord[] = [];
  for (const item of o.items) {
    if (!item || typeof item !== "object") continue;
    const r = item as AnyRec;
    const id = cleanStr(r.id, 60);
    const profileId = cleanStr(r.profileId, 60);
    if (!id || !profileId) continue;
    const lastMessages = Array.isArray(r.lastMessages)
      ? (r.lastMessages as unknown[]).map((m) => cleanStr(m, MAX_MESSAGE)).filter(Boolean).slice(-4)
      : [];
    out.push({
      id,
      profileId,
      profileName: cleanStr(r.profileName, 40) || "Someone",
      reason: "unmatch",
      messageCount: Math.max(0, Math.round(toNum(r.messageCount, 0))),
      lastMessages,
      at: toNum(r.at, Date.now()),
    });
    if (out.length >= MAX_SAFETY) break;
  }
  return out;
}

export function safetyToBlob(items: SafetyRecord[]): Record<string, unknown> {
  return { items: items.slice(0, MAX_SAFETY) };
}

export function idsToBlob(ids: string[]): Record<string, unknown> {
  return { ids: ids.slice(-400) };
}

export function sanitizeModLog(rec: unknown): ModActionLog[] {
  const o = extractObject(rec);
  if (!o || !Array.isArray(o.items)) return [];
  const out: ModActionLog[] = [];
  for (const item of o.items) {
    if (!item || typeof item !== "object") continue;
    const r = item as AnyRec;
    const id = cleanStr(r.id, 60);
    const actionRaw = cleanStr(r.action, 20);
    if (!id || !(ACTION_IDS as string[]).includes(actionRaw)) continue;
    out.push({
      id,
      reportId: cleanStr(r.reportId, 60),
      profileName: cleanStr(r.profileName, 40) || "Someone",
      action: actionRaw as ModAction,
      at: toNum(r.at, Date.now()),
    });
    if (out.length >= MAX_MOD_ACTIONS) break;
  }
  return out;
}

// ---------- serializers ----------

export function profileToBlob(p: DatingProfile): Record<string, unknown> {
  return { ...p };
}
export function prefsToBlob(p: DatingPrefs): Record<string, unknown> {
  return { ...p };
}
export function consentToBlob(c: ConsentState): Record<string, unknown> {
  return { ...c };
}
export function premiumToBlob(p: PremiumState): Record<string, unknown> {
  return { ...p };
}
export function decisionsToBlob(d: DecisionState): Record<string, unknown> {
  return { likes: d.likes.slice(-400), passes: d.passes.slice(-400) };
}
export function matchesToBlob(items: Match[]): Record<string, unknown> {
  return { items: items.slice(0, 200) };
}
export function threadsToBlob(t: ThreadsState): Record<string, unknown> {
  return { byMatch: t.byMatch, read: t.read, greeted: t.greeted.slice(-200) };
}
export function reportsToBlob(items: Report[]): Record<string, unknown> {
  return { items: items.slice(0, MAX_REPORTS) };
}
export function modLogToBlob(items: ModActionLog[]): Record<string, unknown> {
  return { items: items.slice(0, MAX_MOD_ACTIONS) };
}

// Storage keys
export const KEYS = {
  consent: "bezy.consent",
  profile: "bezy.profile",
  prefs: "bezy.prefs",
  decisions: "bezy.decisions",
  matches: "bezy.matches",
  threads: "bezy.threads",
  reports: "bezy.reports",
  blocks: "bezy.blocks",
  modlog: "bezy.modlog",
  safety: "bezy.safety",
  premium: "bezy.premium",
} as const;
