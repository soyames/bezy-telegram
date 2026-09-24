import { query as telegramQuery } from '../_db.js';
import { query, cors, mediaIdentity, INTERESTS, GENDERS, LOOKING_FOR, VISIBILITIES,
  WHO_CAN_MESSAGE, MIN_AGE, MAX_AGE, MAX_BIO, MAX_INTERESTS, areaFromCity, areaKeyOf, clampAge,
  cleanText } from './_helpers.js';

// The shared profile is the cross-platform face of an account. Telegram fills it from the
// existing Telegram database (read-only); Pi posts it explicitly. Either way it is written
// only to the shared database and only when the account is eligible to be discovered.

const DEFAULT_AGE_MIN = 18;
const DEFAULT_AGE_MAX = 45;

async function upsertMember(member, adult, consent, discoverable) {
  await query(`INSERT INTO bezy_media_members (provider,subject,adult_confirmed,photo_consent,discoverable,updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (provider,subject) DO UPDATE SET adult_confirmed=$3, photo_consent=$4,
       discoverable=$5, updated_at=now()`,
    [member.provider, member.subject, !!adult, !!consent, !!discoverable]);
}

async function upsertProfile(member, profile) {
  await query(
    `INSERT INTO bezy_social_profiles (provider,subject,display_name,age,gender,bio,interests,looking_for,
       area,area_key,interested_in,age_min,age_max,widen_area,visibility,who_can_message,paused,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
     ON CONFLICT (provider,subject) DO UPDATE SET display_name=$3, age=$4, gender=$5, bio=$6,
       interests=$7, looking_for=$8, area=$9, area_key=$10, interested_in=$11, age_min=$12,
       age_max=$13, widen_area=$14, visibility=$15, who_can_message=$16, paused=$17, updated_at=now()`,
    [member.provider, member.subject, profile.name, profile.age, profile.gender, profile.bio,
      profile.interests, profile.lookingFor, profile.area, areaKeyOf(profile.area), profile.interestedIn,
      profile.ageMin, profile.ageMax, profile.widenArea, profile.visibility, profile.whoCanMessage,
      profile.paused]);
}

function interestsOf(values, allowed) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const value of values) {
    const item = cleanText(value, 40);
    if (!item || (allowed && !allowed.includes(item)) || out.includes(item)) continue;
    out.push(item);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

/** Telegram: the shared profile mirrors the existing Telegram rows, never replaces them. */
async function syncTelegram(viewer) {
  const member = { provider: 'telegram', subject: viewer.subject };
  const { rows: userRows } = await telegramQuery(
    `SELECT age_eligibility_confirmed, profile_complete, discoverable, processing_restricted,
            processing_objection
       FROM users WHERE telegram_id = $1`, [member.subject]);
  const user = userRows[0];
  const adult = user?.age_eligibility_confirmed === true;
  const consent = user?.profile_complete === true;

  const { rows: profileRows } = await telegramQuery(
    `SELECT display_name, age, gender, bio, interests, city, seeking
       FROM profiles WHERE telegram_id = $1`, [member.subject]);
  const person = profileRows[0];

  const name = cleanText(person?.display_name, 40);
  const age = clampAge(person?.age);
  const gender = person?.gender === 'non_binary' ? 'nonbinary'
    : (person?.gender === 'woman' || person?.gender === 'man') ? person.gender : null;

  // Not eligible: drop any stale shared profile and keep the media row consistent so
  // photo sharing can never outlive the Telegram consent it was granted under.
  if (!adult || !consent || !gender || age === null || name.length < 2) {
    await query(`DELETE FROM bezy_social_profiles WHERE provider=$1 AND subject=$2`,
      [member.provider, member.subject]);
    await upsertMember(member, adult, consent, false);
    return { discoverable: false };
  }

  const { rows: prefRows } = await telegramQuery(
    `SELECT min_age, max_age, same_city_only FROM preferences WHERE telegram_id = $1`, [member.subject]);
  const prefs = prefRows[0];
  const paused = user.processing_restricted === true || user.processing_objection === true;
  const discoverable = user.discoverable === true && !paused;
  const area = areaFromCity(person?.city);
  const interestedIn = person?.seeking === 'women' ? ['woman']
    : person?.seeking === 'men' ? ['man'] : GENDERS.slice();
  let ageMin = clampAge(prefs?.min_age) ?? DEFAULT_AGE_MIN;
  let ageMax = clampAge(prefs?.max_age) ?? MAX_AGE;
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];

  await upsertMember(member, adult, consent, discoverable);
  await upsertProfile(member, { name, age, gender, bio: cleanText(person?.bio, MAX_BIO),
    interests: interestsOf(person?.interests, null), lookingFor: 'open', area,
    interestedIn, ageMin, ageMax, widenArea: prefs?.same_city_only !== true,
    visibility: 'everyone', whoCanMessage: 'matches', paused });
  return { discoverable };
}

/** Pi: strictly validated self-declared onboarding state. */
async function syncPi(viewer, body) {
  const member = { provider: 'pi', subject: viewer.subject };
  if (body?.adultConfirmed !== true) return { error: 'NOT_ELIGIBLE', status: 403 };
  const raw = body?.profile;
  if (!raw || typeof raw !== 'object') return { error: 'INVALID_PROFILE', status: 400 };

  const name = cleanText(raw.displayName, 40);
  if (name.length < 2) return { error: 'INVALID_PROFILE', status: 400 };
  if (!Number.isInteger(raw.age) || raw.age < MIN_AGE || raw.age > MAX_AGE)
    return { error: 'INVALID_PROFILE', status: 400 };
  if (!GENDERS.includes(raw.gender)) return { error: 'INVALID_PROFILE', status: 400 };
  // Area is a typed city, not a whitelist: areaFromCity normalizes a known area and keeps
  // anything else verbatim, exactly as the Telegram path below already does.
  const area = areaFromCity(cleanText(raw.area, 60));
  if (!area) return { error: 'INVALID_PROFILE', status: 400 };

  const age = raw.age;
  const gender = raw.gender;
  const bio = cleanText(raw.bio, MAX_BIO);
  const interests = interestsOf(raw.interests, INTERESTS);
  const lookingFor = LOOKING_FOR.includes(raw.lookingFor) ? raw.lookingFor : 'open';
  const photoConsent = raw.photoConsent === true;

  const rawPrefs = body?.prefs && typeof body.prefs === 'object' ? body.prefs : {};
  const picked = Array.isArray(rawPrefs.interestedIn)
    ? [...new Set(rawPrefs.interestedIn.filter((value) => GENDERS.includes(value)))].slice(0, 3) : [];
  const interestedIn = picked.length ? picked : GENDERS.slice();
  let ageMin = Number.isInteger(rawPrefs.ageMin)
    ? Math.max(MIN_AGE, Math.min(MAX_AGE, rawPrefs.ageMin)) : DEFAULT_AGE_MIN;
  let ageMax = Number.isInteger(rawPrefs.ageMax)
    ? Math.max(MIN_AGE, Math.min(MAX_AGE, rawPrefs.ageMax)) : MAX_AGE;
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];
  const visibility = VISIBILITIES.includes(rawPrefs.visibility) ? rawPrefs.visibility : 'everyone';
  const whoCanMessage = WHO_CAN_MESSAGE.includes(rawPrefs.whoCanMessage) ? rawPrefs.whoCanMessage : 'matches';
  const paused = rawPrefs.paused === true;

  const complete = name.length >= 2 && gender !== '' && bio.trim().length >= 10
    && interests.length >= 1 && area.trim().length > 0;
  const visible = complete && photoConsent && visibility === 'everyone' && !paused;

  await upsertMember(member, true, photoConsent, visible);
  await upsertProfile(member, { name, age, gender, bio, interests, lookingFor, area,
    interestedIn, ageMin, ageMax, widenArea: rawPrefs.widenArea === true, visibility,
    whoCanMessage, paused });
  return { discoverable: visible };
}

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET','POST','DELETE'].includes(req.method))
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });

    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT display_name, age, gender, area, bio, interests, looking_for, visibility, paused
           FROM bezy_social_profiles WHERE provider=$1 AND subject=$2`,
        [viewer.provider, viewer.subject]);
      const row = rows[0];
      return res.status(200).json({ profile: row ? { name: row.display_name, age: row.age,
        gender: row.gender, area: row.area, bio: row.bio, interests: row.interests || [],
        lookingFor: row.looking_for, visibility: row.visibility, paused: row.paused } : null });
    }

    if (req.method === 'DELETE') {
      await query(`DELETE FROM bezy_social_profiles WHERE provider=$1 AND subject=$2`,
        [viewer.provider, viewer.subject]);
      await query(`UPDATE bezy_media_members SET discoverable=false, photo_consent=false, updated_at=now()
         WHERE provider=$1 AND subject=$2`, [viewer.provider, viewer.subject]);
      await query(`UPDATE bezy_social_matches SET active=false, ended_at=now(),
           ended_by_provider=$1, ended_by_subject=$2, ended_reason='account_deleted'
         WHERE active AND ((a_provider=$1 AND a_subject=$2) OR (b_provider=$1 AND b_subject=$2))`,
        [viewer.provider, viewer.subject]);
      return res.status(204).end();
    }

    const result = viewer.provider === 'telegram' ? await syncTelegram(viewer) : await syncPi(viewer, req.body);
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(200).json({ discoverable: result.discoverable });
  } catch (error) {
    console.error('social profile sync failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
