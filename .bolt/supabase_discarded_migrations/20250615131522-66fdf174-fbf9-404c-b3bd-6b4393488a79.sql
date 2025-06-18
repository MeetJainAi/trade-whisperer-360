
-- Create a table for trade sessions
CREATE TABLE public.trade_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_pnl REAL,
  total_trades INTEGER,
  win_rate REAL,
  avg_win REAL,
  avg_loss REAL,
  max_drawdown REAL,
  equity_curve JSONB,
  time_data JSONB,
  ai_strengths TEXT[],
  ai_mistakes TEXT[],
  ai_fixes TEXT[],
  ai_key_insight TEXT
);

-- Add Row Level Security for trade_sessions
ALTER TABLE public.trade_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trade sessions"
ON public.trade_sessions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create a table for individual trades
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.trade_sessions ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  symbol TEXT,
  side TEXT,
  qty REAL,
  price REAL,
  pnl REAL,
  notes TEXT
);

-- Add Row Level Security for trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own trades"
ON public.trades
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
