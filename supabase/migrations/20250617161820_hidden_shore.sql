-- This migration is now handled by the comprehensive database fix
-- Keeping this file to maintain migration history but making it a no-op

-- Check if raw_trade_data table exists, if not create it
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'raw_trade_data') THEN
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
  END IF;

  -- Add raw_data_id column to trade_sessions if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'raw_data_id') THEN
    ALTER TABLE public.trade_sessions
    ADD COLUMN raw_data_id UUID REFERENCES public.raw_trade_data(id) ON DELETE SET NULL;
  END IF;
END $$;