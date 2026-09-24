import { query } from '../_db.js';
import { mediaQuery } from './_db.js';
import { cors, mediaIdentity } from './_auth.js';

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const member = await mediaIdentity(req);
    if (!member) return res.status(401).json({ error: 'INVALID_SESSION' });
    let adult, consent, discoverable;
    if (member.provider === 'telegram') {
      const { rows } = await query(
        `SELECT u.age_eligibility_confirmed AS adult, u.discoverable, u.profile_complete,
                u.processing_restricted, u.processing_objection
           FROM users u WHERE u.telegram_id = $1`, [member.subject]);
      const profile = rows[0];
      adult = profile?.adult === true;
      consent = adult && profile?.profile_complete === true;
      discoverable = consent && profile?.discoverable === true
        && !profile?.processing_restricted && !profile?.processing_objection;
    } else {
      // Age is self-declared in the Pi app. The current Pi App Studio export
      // cannot provide verified age. Never infer age from Pi sign-in/KYC.
      adult = req.body?.adultConfirmed === true;
      consent = req.body?.photoConsent === true;
      discoverable = adult && consent && req.body?.discoverable === true;
    }
    await mediaQuery(req.body?.ensure === true && member.provider === 'pi'
      ? `INSERT INTO bezy_media_members (provider,subject,adult_confirmed,photo_consent,discoverable)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (provider,subject) DO NOTHING`
      : `INSERT INTO bezy_media_members (provider, subject, adult_confirmed, photo_consent, discoverable, updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (provider,subject) DO UPDATE SET adult_confirmed=$3,
           photo_consent=$4, discoverable=$5, updated_at=now()`,
      [member.provider, member.subject, !!adult, !!consent, !!discoverable]);
    return res.status(200).json({ discoverable: !!discoverable });
  } catch (error) {
    console.error('media member sync failed', error?.code || error?.name);
    return res.status(503).json({ error: 'MEDIA_UNAVAILABLE' });
  }
}
