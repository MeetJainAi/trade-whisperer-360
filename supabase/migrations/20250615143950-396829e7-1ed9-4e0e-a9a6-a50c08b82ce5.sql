
-- Add columns for strategy, tags, and image URL to the trades table
ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS strategy TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS image_url TEXT;

