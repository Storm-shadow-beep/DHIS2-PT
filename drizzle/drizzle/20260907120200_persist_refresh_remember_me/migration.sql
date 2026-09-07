-- Preserve the remember-me decision when rotating refresh tokens.
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS remember_me boolean NOT NULL DEFAULT false;
