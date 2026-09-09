import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';

function genderMatches(current, candidate) {
  const currentGender = current?.gender || 'prefer_not_to_say';
  const candidateGender = candidate?.gender || 'prefer_not_to_say';
  const currentSeeking = current?.seeking || 'everyone';
  const candidateSeeking = candidate?.seeking || 'everyone';

  const wantsCandidate = currentSeeking === 'everyone'
    || (currentSeeking === 'women' && candidateGender === 'woman')
    || (currentSeeking === 'men' && candidateGender === 'man');
  const candidateWantsCurrent = candidateSeeking === 'everyone'
    || (candidateSeeking === 'women' && currentGender === 'woman')
    || (candidateSeeking === 'men' && currentGender === 'man');
  return wantsCandidate && candidateWantsCurrent;
}

function publicProfile(id, data) {
  const profile = data.profile || {};
  return {
    id: String(id),
    displayName: profile.displayName || data.firstName || 'Bezy member',
    age: profile.age || null,
    city: profile.city || '',
    bio: profile.bio || '',
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    photoUrl: data.photoUrl || '',
    username: data.username || '',
    telegramId: data.telegramId || Number(id)
  };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const currentRef = db().collection('users').doc(String(user.id));
  const currentSnap = await currentRef.get();
  if (!currentSnap.exists) return res.status(404).json({ error: 'Profile not found' });

  const currentData = currentSnap.data() || {};
  if (!currentData.profileComplete) {
    return res.status(200).json({ ok: true, profiles: [], needsProfile: true });
  }

  const actionSnap = await currentRef.collection('actions').get();
  const excluded = new Set(actionSnap.docs.map((doc) => doc.id));
  const candidatesSnap = await db().collection('users').where('discoverable', '==', true).limit(100).get();

  const profiles = [];
  for (const doc of candidatesSnap.docs) {
    if (doc.id === String(user.id) || excluded.has(doc.id)) continue;
    const data = doc.data() || {};
    if (!data.profileComplete || !genderMatches(currentData.profile, data.profile)) continue;
    profiles.push(publicProfile(doc.id, data));
    if (profiles.length >= 20) break;
  }

  return res.status(200).json({ ok: true, profiles, needsProfile: false });
}
