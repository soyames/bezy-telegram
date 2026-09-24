-- Media metadata only. No image bytes are stored in Postgres.
BEGIN;
CREATE TABLE IF NOT EXISTS bezy_media_members (
  provider text NOT NULL CHECK (provider IN ('pi', 'telegram')),
  subject text NOT NULL,
  adult_confirmed boolean NOT NULL DEFAULT false,
  photo_consent boolean NOT NULL DEFAULT false,
  discoverable boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE TABLE IF NOT EXISTS bezy_media_photos (
  photo_id uuid PRIMARY KEY,
  owner_provider text NOT NULL,
  owner_subject text NOT NULL,
  blob_url text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_provider, owner_subject) REFERENCES bezy_media_members(provider, subject) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bezy_media_owner_idx ON bezy_media_photos(owner_provider, owner_subject, created_at);
CREATE TABLE IF NOT EXISTS bezy_media_blocks (
  blocker_provider text NOT NULL,
  blocker_subject text NOT NULL,
  blocked_provider text NOT NULL,
  blocked_subject text NOT NULL,
  PRIMARY KEY (blocker_provider, blocker_subject, blocked_provider, blocked_subject)
);
COMMIT;
