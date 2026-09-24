-- Shared cross-platform dating metadata (profiles, decisions, matches, messages,
-- reads, reports). No image bytes anywhere in Postgres. Run ONLY on the separate
-- Bezy shared database (BEZY_MEDIA_DATABASE_URL) — never on the Telegram database.
BEGIN;
CREATE TABLE IF NOT EXISTS bezy_social_profiles (
  provider text NOT NULL, subject text NOT NULL,
  display_name text NOT NULL, age integer NOT NULL,
  gender text NOT NULL CHECK (gender IN ('woman','man','nonbinary')),
  bio text NOT NULL DEFAULT '', interests text[] NOT NULL DEFAULT '{}',
  looking_for text NOT NULL DEFAULT 'open' CHECK (looking_for IN ('long_term','casual','friends','open')),
  area text NOT NULL DEFAULT '', area_key text NOT NULL DEFAULT '',
  interested_in text[] NOT NULL, age_min integer NOT NULL, age_max integer NOT NULL,
  widen_area boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','matches_only','hidden')),
  who_can_message text NOT NULL DEFAULT 'matches' CHECK (who_can_message IN ('matches','everyone')),
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  FOREIGN KEY (provider, subject) REFERENCES bezy_media_members(provider, subject) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bezy_social_profiles_discover_idx ON bezy_social_profiles (visibility, paused, gender, area_key);

CREATE TABLE IF NOT EXISTS bezy_social_decisions (
  actor_provider text NOT NULL, actor_subject text NOT NULL,
  target_provider text NOT NULL, target_subject text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('like','pass')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_provider, actor_subject, target_provider, target_subject)
);
CREATE INDEX IF NOT EXISTS bezy_social_decisions_rev_idx ON bezy_social_decisions (target_provider, target_subject, actor_provider, actor_subject);

CREATE TABLE IF NOT EXISTS bezy_social_matches (
  match_id uuid PRIMARY KEY,
  a_provider text NOT NULL, a_subject text NOT NULL,
  b_provider text NOT NULL, b_subject text NOT NULL,
  source text NOT NULL DEFAULT 'mutual_like',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz, ended_by_provider text, ended_by_subject text, ended_reason text,
  CHECK ((a_provider < b_provider) OR (a_provider = b_provider AND a_subject < b_subject))
);
CREATE INDEX IF NOT EXISTS bezy_social_matches_a_idx ON bezy_social_matches (a_provider, a_subject, created_at DESC);
CREATE INDEX IF NOT EXISTS bezy_social_matches_b_idx ON bezy_social_matches (b_provider, b_subject, created_at DESC);

CREATE TABLE IF NOT EXISTS bezy_social_messages (
  match_id uuid NOT NULL REFERENCES bezy_social_matches(match_id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  sender_provider text NOT NULL, sender_subject text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, client_id)
);
CREATE INDEX IF NOT EXISTS bezy_social_messages_window_idx ON bezy_social_messages (match_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bezy_social_reads (
  match_id uuid NOT NULL REFERENCES bezy_social_matches(match_id) ON DELETE CASCADE,
  reader_provider text NOT NULL, reader_subject text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, reader_provider, reader_subject)
);

CREATE TABLE IF NOT EXISTS bezy_social_reports (
  report_id uuid PRIMARY KEY,
  reporter_provider text NOT NULL, reporter_subject text NOT NULL,
  target_provider text NOT NULL, target_subject text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('fake','harassment','inappropriate','underage','other')),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open', action text,
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
COMMIT;
