
-- Enable RLS for all relevant tables
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_trade_data ENABLE ROW LEVEL SECURITY;

-- Policies for journals table
DROP POLICY IF EXISTS "Users can manage their own journals" ON public.journals;
CREATE POLICY "Users can manage their own journals"
ON public.journals
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for trade_sessions table
DROP POLICY IF EXISTS "Users can manage their own trade sessions" ON public.trade_sessions;
CREATE POLICY "Users can manage their own trade sessions"
ON public.trade_sessions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for trades table
DROP POLICY IF EXISTS "Users can manage their own trades" ON public.trades;
CREATE POLICY "Users can manage their own trades"
ON public.trades
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for raw_trade_data table
DROP POLICY IF EXISTS "Users can manage their own raw trade data" ON public.raw_trade_data;
CREATE POLICY "Users can manage their own raw trade data"
ON public.raw_trade_data
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add foreign key constraints for data integrity

-- Foreign key from trade_sessions to journals
ALTER TABLE public.trade_sessions DROP CONSTRAINT IF EXISTS trade_sessions_journal_id_fkey;
ALTER TABLE public.trade_sessions
ADD CONSTRAINT trade_sessions_journal_id_fkey
FOREIGN KEY (journal_id)
REFERENCES public.journals(id)
ON DELETE CASCADE;

-- Foreign key from trades to journals
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_journal_id_fkey;
ALTER TABLE public.trades
ADD CONSTRAINT trades_journal_id_fkey
FOREIGN KEY (journal_id)
REFERENCES public.journals(id)
ON DELETE CASCADE;

-- Foreign key from trades to trade_sessions
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_session_id_fkey;
ALTER TABLE public.trades
ADD CONSTRAINT trades_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES public.trade_sessions(id)
ON DELETE CASCADE;

-- Foreign key from trade_sessions to raw_trade_data
ALTER TABLE public.trade_sessions DROP CONSTRAINT IF EXISTS trade_sessions_raw_data_id_fkey;
ALTER TABLE public.trade_sessions
ADD CONSTRAINT trade_sessions_raw_data_id_fkey
FOREIGN KEY (raw_data_id)
REFERENCES public.raw_trade_data(id)
ON DELETE SET NULL;
