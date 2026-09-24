import { query as telegramQuery } from '../_db.js';
import { mediaQuery as query } from './_db.js';
import { sameMember } from './_auth.js';

// Shared photo authorization. The media endpoints and the social layer (match cards)
// both answer the same question — may this viewer download this owner's photos? —
// so the rule lives in exactly one place.
export async function photoAccess(viewer, owner) {
  if (sameMember(viewer, owner)) return true;
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM bezy_media_members WHERE provider=$1 AND subject=$2
         AND adult_confirmed) AS viewer_ok,
       EXISTS (SELECT 1 FROM bezy_media_members WHERE provider=$3 AND subject=$4
         AND adult_confirmed AND photo_consent AND discoverable) AS owner_ok,
       EXISTS (SELECT 1 FROM bezy_media_blocks WHERE
         (blocker_provider=$1 AND blocker_subject=$2 AND blocked_provider=$3 AND blocked_subject=$4)
         OR (blocker_provider=$3 AND blocker_subject=$4 AND blocker_provider=$1 AND blocked_subject=$2)) AS blocked`,
    [viewer.provider,viewer.subject,owner.provider,owner.subject]);
  if (!rows[0]?.viewer_ok || !rows[0]?.owner_ok || rows[0]?.blocked) return false;
  if (viewer.provider === 'telegram' && owner.provider === 'telegram') {
    const legacy = await telegramQuery(`SELECT EXISTS (SELECT 1 FROM blocks WHERE
       (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)) AS blocked`,
      [viewer.subject,owner.subject]);
    if (legacy.rows[0]?.blocked) return false;
  }
  return true;
}
