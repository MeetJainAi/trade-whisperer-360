
ALTER TABLE public.trade_sessions
ADD COLUMN IF NOT EXISTS  profit_factor REAL,
ADD COLUMN IF NOT EXISTS  trades_by_day JSONB,
ADD COLUMN IF NOT EXISTS  trades_by_symbol JSONB;
