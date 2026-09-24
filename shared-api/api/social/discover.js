import { query, cors, mediaIdentity, encodeMember, memberHues, sharedInterests,
  MAX_PHOTOS, MIN_AGE } from './_helpers.js';

// Both sides' rules are enforced in one query: the viewer's filters, the candidate's own
// preferences and visibility, blocks, reports and existing matches. Ranking happens in JS
// (shared interests, then age closeness) because the deck is capped at 30 cards.

const CANDIDATE_POOL = 200;
const DECK_SIZE = 30;

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });

    const { rows: memberRows } = await query(
      `SELECT adult_confirmed FROM bezy_media_members WHERE provider=$1 AND subject=$2`,
      [viewer.provider, viewer.subject]);
    const member = memberRows[0];
    const { rows: profileRows } = await query(
      `SELECT age, gender, interests, interested_in, age_min, age_max, widen_area, area_key, paused
         FROM bezy_social_profiles WHERE provider=$1 AND subject=$2`,
      [viewer.provider, viewer.subject]);
    const profile = profileRows[0];
    if (!member || !profile || profile.paused || !Number.isInteger(profile.age) || profile.age < MIN_AGE)
      return res.status(200).json({ candidates: [], reason: 'not_eligible' });

    const { rows } = await query(
      `SELECT p.provider, p.subject, p.display_name, p.age, p.gender, p.bio, p.interests,
              p.looking_for, p.area, m.photo_consent
       FROM bezy_social_profiles p
       JOIN bezy_media_members m ON m.provider = p.provider AND m.subject = p.subject
       WHERE NOT (p.provider = $1 AND p.subject = $2)
         AND m.discoverable AND m.adult_confirmed
         AND NOT p.paused AND p.visibility = 'everyone'
         AND p.gender = ANY($3::text[])
         AND p.age BETWEEN $4 AND $5
         AND $6 = ANY(p.interested_in)
         AND $7 BETWEEN p.age_min AND p.age_max
         AND ($8 OR p.area_key = $9 OR p.area_key = '')
         AND NOT ($1 = 'telegram' AND p.provider = 'telegram')
         AND NOT EXISTS (SELECT 1 FROM bezy_social_decisions d
             WHERE d.actor_provider=$1 AND d.actor_subject=$2
               AND d.target_provider=p.provider AND d.target_subject=p.subject)
         AND NOT EXISTS (SELECT 1 FROM bezy_media_blocks b WHERE
             (b.blocker_provider=$1 AND b.blocker_subject=$2 AND b.blocked_provider=p.provider AND b.blocked_subject=p.subject)
             OR (b.blocker_provider=p.provider AND b.blocker_subject=p.subject AND b.blocked_provider=$1 AND b.blocked_subject=$2))
         AND NOT EXISTS (SELECT 1 FROM bezy_social_matches x WHERE x.active
             AND ((x.a_provider=$1 AND x.a_subject=$2 AND x.b_provider=p.provider AND x.b_subject=p.subject)
               OR (x.b_provider=$1 AND x.b_subject=$2 AND x.a_provider=p.provider AND x.a_subject=p.subject)))
         AND NOT EXISTS (SELECT 1 FROM bezy_social_reports r
             WHERE r.reporter_provider=$1 AND r.reporter_subject=$2
               AND r.target_provider=p.provider AND r.target_subject=p.subject)
       LIMIT ${CANDIDATE_POOL}`,
      [viewer.provider, viewer.subject, profile.interested_in, profile.age_min, profile.age_max,
        profile.gender, profile.age, profile.widen_area === true, profile.area_key]);

    const deck = rows.map((row) => ({ row, shared: sharedInterests(profile.interests, row.interests),
      distance: Math.abs(row.age - profile.age) }))
      .sort((a, b) => (b.shared - a.shared) || (a.distance - b.distance))
      .slice(0, DECK_SIZE);

    // Without an adult-confirmed media member the viewer sees cards but no photos.
    const canSeePhotos = member.adult_confirmed === true;
    const candidates = [];
    for (const { row } of deck) {
      let photoIds = [];
      if (canSeePhotos && row.photo_consent) {
        try {
          const { rows: photos } = await query(`SELECT photo_id FROM bezy_media_photos
             WHERE owner_provider=$1 AND owner_subject=$2 ORDER BY created_at LIMIT $3`,
            [row.provider, row.subject, MAX_PHOTOS]);
          photoIds = photos.map((photo) => photo.photo_id);
        } catch (error) {
          // A missing photo must never empty the deck.
          console.error('social discover photo lookup failed', error?.code || error?.name);
        }
      }
      const { hueA, hueB } = memberHues(row.provider, row.subject);
      candidates.push({ id: encodeMember(row.provider, row.subject), provider: row.provider,
        name: row.display_name, age: row.age, gender: row.gender, area: row.area, bio: row.bio,
        interests: row.interests || [], lookingFor: row.looking_for, hueA, hueB, photoIds });
    }
    return res.status(200).json({ candidates });
  } catch (error) {
    console.error('social discover failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
