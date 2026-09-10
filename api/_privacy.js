// Legal states that pause processing, as distinct from the user's own `discoverable`
// preference. While either is in force, Bezy stores the account but does not act on it: no
// deck is assembled for it, it can neither like nor be liked, it cannot match, and engagement
// notifications stop. Both are recorded legal states with timestamps (GDPR Art. 18
// restriction, Art. 21 objection), and both are deliberately reversible — lifting either one
// does NOT republish the profile, because `discoverable` stays false until the user turns it
// back on themselves.
//
// The distinction matters in the export and in the Mini App, which report each state
// separately, but every enforcement point cares only about the same question: is this account
// paused? Answering it in one place keeps the enforcement points from drifting.
export function processingPaused(userData = {}) {
  return userData?.processingRestricted === true || userData?.processingObjection === true;
}
