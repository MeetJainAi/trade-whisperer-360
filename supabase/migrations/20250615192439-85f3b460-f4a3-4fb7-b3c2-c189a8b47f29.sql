
-- Create a table for journals to organize trades
CREATE TABLE public.journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prop_firm TEXT,
  account_size NUMERIC,
  broker TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.journals IS 'Stores user-created trading journals for different accounts, prop firms, or brokers.';

-- Enable Row Level Security for journals
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;

-- Policies for journals table
CREATE POLICY "Users can view their own journals" ON public.journals
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own journals" ON public.journals
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journals" ON public.journals
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journals" ON public.journals
FOR DELETE USING (auth.uid() = user_id);

-- Add a foreign key to link trade sessions to a journal
ALTER TABLE public.trade_sessions
ADD COLUMN journal_id UUID REFERENCES public.journals(id) ON DELETE CASCADE;
COMMENT ON COLUMN public.trade_sessions.journal_id IS 'The journal this trade session belongs to.';
