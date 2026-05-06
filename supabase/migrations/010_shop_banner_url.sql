-- Add banner_url column to shops table for hero/cover photo on public page
ALTER TABLE shops ADD COLUMN IF NOT EXISTS banner_url TEXT;
