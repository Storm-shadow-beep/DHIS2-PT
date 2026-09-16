ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_picture text,
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;
