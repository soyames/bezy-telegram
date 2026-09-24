-- Pi Network payments. One row per payment Pi has confirmed, so Premium is granted from a
-- durable server record instead of a client callback the member controls.
-- Run ONLY on the separate Bezy shared database (BEZY_MEDIA_DATABASE_URL).
BEGIN;
CREATE TABLE IF NOT EXISTS bezy_pi_payments (
  payment_id text PRIMARY KEY,
  provider text NOT NULL,
  subject text NOT NULL,
  product_id text NOT NULL,
  amount numeric NOT NULL,
  txid text,
  -- 'approved' after Pi approves and before completion; 'completed' once Pi confirms the
  -- blockchain transaction; 'cancelled' when the member abandoned the sheet.
  status text NOT NULL CHECK (status IN ('approved','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (provider, subject) REFERENCES bezy_media_members(provider, subject) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bezy_pi_payments_member_idx
  ON bezy_pi_payments (provider, subject, completed_at DESC);
COMMIT;
