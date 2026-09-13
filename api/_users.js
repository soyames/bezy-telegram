import { query as defaultQuery, toIso } from './_db.js';

/** The complete account view, assembled from the relational tables into the documented shape. */
export async function readUser(userId, query = defaultQuery) {
  return (await readUsers([userId], query)).get(String(userId)) || accountFromRow({ telegram_id: userId });
}

export async function readUsers(ids, query = defaultQuery) {
  if (!ids.length) return new Map();
  const result = await query(`SELECT u.*, row_to_json(p) AS profile_data, row_to_json(pr) AS preference_data,
    row_to_json(ns) AS notification_data, row_to_json(pm) AS premium_data, row_to_json(us) AS usage_data,
    COALESCE((SELECT json_agg(json_build_object('id',pa.id,'answer',pa.answer) ORDER BY pa.position, pa.id)
      FROM prompt_answers pa WHERE pa.telegram_id=u.telegram_id), '[]'::json) AS prompts
    FROM users u LEFT JOIN profiles p USING(telegram_id) LEFT JOIN preferences pr USING(telegram_id)
    LEFT JOIN notification_settings ns USING(telegram_id) LEFT JOIN premium_memberships pm USING(telegram_id)
    LEFT JOIN usage us USING(telegram_id) WHERE u.telegram_id=ANY($1::bigint[])`, [ids.map(String)]);
  return new Map(result.rows.map(row => [String(row.telegram_id), accountFromRow(row)]));
}

export function accountFromRow(u) {
  const p = u.profile_data || {};
  const prefs = u.preference_data || {};
  const ns = u.notification_data || {};
  const pm = u.premium_data || {};
  const us = u.usage_data || {};

  const profile = {
    displayName: p.display_name ?? '',
    age: p.age ?? null,
    gender: p.gender ?? '',
    seeking: p.seeking ?? 'everyone',
    city: p.city ?? '',
    bio: p.bio ?? '',
    interests: p.interests ?? [],
    prompts: u.prompts || [],
    languages: p.languages ?? [],
    discoverable: Boolean(u.discoverable),
    profileComplete: Boolean(u.profile_complete)
  };

  return {
    telegramId: String(u.telegram_id),
    firstName: u.first_name ?? null,
    username: u.username ?? null,
    languageCode: u.language_code ?? null,
    locale: u.locale ?? null,
    photoUrl: u.photo_url ?? null,
    createdAt: toIso(u.created_at),
    updatedAt: toIso(u.updated_at),
    ageEligibilityConfirmed: u.age_eligibility_confirmed === true,
    ageEligibilityConfirmedAt: toIso(u.age_eligibility_confirmed_at),
    ageEligibilityMethod: u.age_eligibility_method ?? null,
    profileComplete: Boolean(u.profile_complete),
    discoverable: Boolean(u.discoverable),
    processingRestricted: u.processing_restricted === true,
    processingRestrictedAt: toIso(u.processing_restricted_at),
    processingObjection: u.processing_objection === true,
    processingObjectedAt: toIso(u.processing_objected_at),
    bezyPremium: { active: pm.active === true, planId: pm.plan_id ?? null, expiresAt: toIso(pm.expires_at),
      revokedAt: toIso(pm.revoked_at), revocationReason: pm.revocation_reason ?? null },
    usage: { day: us.day ?? null, discoveryActions: us.discovery_actions || 0, superLikes: us.super_likes || 0 },
    preferences: {
      minAge: prefs.min_age ?? 18,
      maxAge: prefs.max_age ?? 100,
      city: prefs.city ?? '',
      sameCityOnly: prefs.same_city_only === true,
      languages: prefs.languages ?? []
    },
    notifications: {
      matches: ns.matches !== false,
      super_likes: ns.super_likes !== false,
      profile_reminders: ns.profile_reminders !== false,
      messages: ns.messages !== false
    },
    profile
  };
}
