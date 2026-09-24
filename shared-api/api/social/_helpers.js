// Shared helpers for the cross-platform Bezy social API. Every query here goes to the
// separate shared database (BEZY_MEDIA_DATABASE_URL via media/_db.js mediaQuery) —
// never to the Telegram DATABASE_URL. A member is always the pair (provider, subject).

import { mediaQuery as query, mediaTx, mediaAdvisoryLock } from '../media/_db.js';
import { cors, mediaIdentity, sameMember } from '../media/_auth.js';
import { photoAccess } from '../media/_access.js';

export { query, mediaTx, mediaAdvisoryLock, cors, mediaIdentity, sameMember, photoAccess };

export const PROVIDERS = ['pi', 'telegram'];
export const GENDERS = ['woman', 'man', 'nonbinary'];
export const LOOKING_FOR = ['long_term', 'casual', 'friends', 'open'];
export const VISIBILITIES = ['everyone', 'matches_only', 'hidden'];
export const WHO_CAN_MESSAGE = ['matches', 'everyone'];
export const REPORT_REASONS = ['fake', 'harassment', 'inappropriate', 'underage', 'other'];

// Mirrors pi-app/lib/bezy/data.ts — both frontends and this API validate against the
// same list, so a profile stored on one platform is valid on the other.
export const AREAS = [
  'Greater London',
  'Manchester area',
  'Greater Paris',
  'Berlin area',
  'Lagos metro',
  'Nairobi area',
  'New York City area',
  'Los Angeles area',
  'Toronto area',
  'Sydney area',
  'Mumbai area',
  'São Paulo area'
];

export const INTERESTS = [
  'Hiking',
  'Coffee',
  'Live music',
  'Cooking',
  'Travel',
  'Reading',
  'Art',
  'Fitness',
  'Gaming',
  'Photography',
  'Dancing',
  'Films',
  'Foodie',
  'Yoga',
  'Startups',
  'Volunteering',
  'Dogs',
  'Cats',
  'Board games',
  'Astronomy'
];

export const MIN_AGE = 18;
export const MAX_AGE = 80;
export const MAX_BIO = 400;
export const MAX_INTERESTS = 8;
export const MAX_MESSAGE = 800;
export const MAX_PHOTOS = 6;

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TELEGRAM_ID = /^\d{1,20}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const MEMBER_SEPARATOR = ':';

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function isClientId(value) {
  return typeof value === 'string' && CLIENT_ID.test(value);
}

/** A member is a provider plus its provider-native subject, never a name or username. */
export function memberOf(provider, subject) {
  if (!PROVIDERS.includes(provider)) return null;
  if (typeof subject !== 'string' || !subject || subject.length > 128) return null;
  // No whitespace, no separator, no control characters: the pair must round-trip
  // through one opaque token without ambiguity.
  if (/[\s:\u0000-\u001f\u007f]/.test(subject)) return null;
  if (provider === 'telegram' && !TELEGRAM_ID.test(subject)) return null;
  return { provider, subject };
}

export function encodeMember(provider, subject) {
  return Buffer.from(`${provider}${MEMBER_SEPARATOR}${subject}`, 'utf8').toString('base64url');
}

export function decodeMember(value) {
  if (typeof value !== 'string' || !value || value.length > 400) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  let raw;
  try {
    raw = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const at = raw.indexOf(MEMBER_SEPARATOR);
  if (at < 1) return null;
  const member = memberOf(raw.slice(0, at), raw.slice(at + 1));
  // Reject non-canonical encodings: the client gets back exactly what we issued.
  if (!member || encodeMember(member.provider, member.subject) !== value) return null;
  return member;
}

export function areaKeyOf(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

/**
 * Free-text Telegram city to a shared area. A known AREA wins when the text overlaps it
 * (either direction) and is long enough to be meaningful; otherwise the city is kept
 * verbatim (≤40 chars) so cross-platform discovery can still match on it.
 */
export function areaFromCity(city) {
  const raw = typeof city === 'string' ? city.trim() : '';
  if (!raw) return '';
  const key = areaKeyOf(raw);
  if (key.length >= 4) {
    for (const area of AREAS) {
      const areaKey = areaKeyOf(area);
      if (areaKey.includes(key) || key.includes(areaKey)) return area;
    }
  }
  return raw.slice(0, 40);
}

/** Trim, drop control characters (newlines and tabs survive), then bound the length. */
export function cleanText(value, max = 500) {
  if (typeof value !== 'string') return '';
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, (c) => (c === '\n' || c === '\t' ? c : ' '));
  return stripped.trim().slice(0, max);
}

/** Null for anything that is not a usable age — an absent age must never become 18. */
export function clampAge(value) {
  if (value === null || value === undefined || value === '') return null;
  const age = Math.round(Number(value));
  if (!Number.isFinite(age)) return null;
  return Math.max(MIN_AGE, Math.min(MAX_AGE, age));
}

/** Timestamps reach the API as ISO strings; pg hands back Date objects. */
export function isoAt(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

/** FNV-1a, identical to hueFor() in pi-app/lib/bezy/data.ts so avatars match everywhere. */
export function hueFor(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function memberHues(provider, subject) {
  const hueA = hueFor(`${provider}${MEMBER_SEPARATOR}${subject}`);
  return { hueA, hueB: (hueA + 45) % 360 };
}

export function sharedInterests(a, b) {
  const set = new Set(Array.isArray(b) ? b : []);
  return (Array.isArray(a) ? a : []).filter((item) => set.has(item)).length;
}

/** photo_id list for a counterpart, gated by the shared photo authorization rule. */
export async function photoIdsFor(viewer, owner) {
  if (!(await photoAccess(viewer, owner))) return [];
  const { rows } = await query(`SELECT photo_id FROM bezy_media_photos
    WHERE owner_provider=$1 AND owner_subject=$2 ORDER BY created_at LIMIT $3`,
    [owner.provider, owner.subject, MAX_PHOTOS]);
  return rows.map((row) => row.photo_id);
}

/**
 * The card both discovery and match lists render for another member. Null when the
 * member has no shared profile yet (a photo-only account), so clients fall back.
 */
export async function counterpartCard(viewer, provider, subject) {
  const { rows } = await query(`SELECT display_name, age, gender, bio, interests, looking_for, area
    FROM bezy_social_profiles WHERE provider=$1 AND subject=$2`, [provider, subject]);
  const row = rows[0];
  if (!row) return null;
  let photoIds = [];
  try {
    photoIds = await photoIdsFor(viewer, { provider, subject });
  } catch (error) {
    // A photo lookup must never take a match list down.
    console.error('social photo lookup failed', error?.code || error?.name);
  }
  const { hueA, hueB } = memberHues(provider, subject);
  return { id: encodeMember(provider, subject), provider, name: row.display_name, age: row.age,
    gender: row.gender, area: row.area, bio: row.bio, interests: row.interests || [],
    lookingFor: row.looking_for, hueA, hueB, photoIds };
}

/** The canonical (a, b) order the bezy_social_matches CHECK constraint enforces. */
export function orderPair(one, two) {
  if (one.provider === two.provider) return one.subject < two.subject ? [one, two] : [two, one];
  return one.provider < two.provider ? [one, two] : [two, one];
}

export function matchKey(one, two) {
  const [a, b] = orderPair(one, two);
  return `match:${a.provider}:${a.subject}:${b.provider}:${b.subject}`;
}
