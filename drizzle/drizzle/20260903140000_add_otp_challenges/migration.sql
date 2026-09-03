-- Persist email OTP login challenges and send history.
CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  purpose varchar(30) NOT NULL DEFAULT 'login',
  code_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consumed_at timestamptz,
  superseded_at timestamptz,
  delivery_failed_at timestamptz,
  resend_available_at timestamptz NOT NULL,
  ip_address varchar(100),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_challenges_email_created_idx
  ON otp_challenges(email, created_at);

CREATE INDEX IF NOT EXISTS otp_challenges_user_active_idx
  ON otp_challenges(user_id, purpose, created_at);
