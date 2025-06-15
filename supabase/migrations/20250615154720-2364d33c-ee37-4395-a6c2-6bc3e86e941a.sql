
ALTER TABLE public.trade_sessions
ADD COLUMN profit_factor REAL,
ADD COLUMN trades_by_day JSONB,
ADD COLUMN trades_by_symbol JSONB;
