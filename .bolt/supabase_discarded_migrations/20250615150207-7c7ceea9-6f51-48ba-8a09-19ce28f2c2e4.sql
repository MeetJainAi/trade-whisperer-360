
-- Create a table to store raw trade data from CSV uploads
CREATE TABLE public.raw_trade_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  file_name TEXT,
  headers TEXT[],
  data JSONB
);

-- Add Row Level Security for raw_trade_data
ALTER TABLE public.raw_trade_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own raw trade data"
ON public.raw_trade_data
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add a column to trade_sessions to link back to the raw data upload.
-- This creates a one-to-one link between an analysis session and its source file.
ALTER TABLE public.trade_sessions
ADD COLUMN IF NOT EXISTS raw_data_id UUID UNIQUE REFERENCES public.raw_trade_data(id) ON DELETE SET NULL;
