
-- Add the missing expectancy column to trade_sessions table
ALTER TABLE public.trade_sessions 
ADD COLUMN expectancy real;
