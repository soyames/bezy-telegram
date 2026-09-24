-- Discovery stopped gating on location for Pi members. Telegram members were already wide
-- (syncTelegram sets widen_area from "same city only", which defaults off), but Pi profiles
-- stored the old default of false, so a member whose area did not match anyone saw an empty
-- deck while the other network showed people.
--
-- Scoped to Pi: a Telegram member who deliberately turned on "same city only" keeps it.
-- Run ONLY on the separate Bezy shared database (BEZY_MEDIA_DATABASE_URL).
BEGIN;
UPDATE bezy_social_profiles SET widen_area = true
 WHERE provider = 'pi' AND widen_area = false;
COMMIT;
