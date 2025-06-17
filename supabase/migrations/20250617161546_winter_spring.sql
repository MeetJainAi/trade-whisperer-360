/*
  # Comprehensive Database Schema Fix
  
  1. Clean Database Setup
    - Proper table creation with correct data types
    - Comprehensive constraints and indexes
    - Fixed foreign key relationships
    - Proper RLS policies
  
  2. Data Integrity
    - Clean up orphaned data
    - Ensure referential integrity
    - Add validation constraints
  
  3. Performance
    - Optimized indexes for queries
    - Efficient duplicate prevention
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CLEAN UP EXISTING SCHEMA ISSUES
-- =====================================================

-- Drop existing problematic constraints and indexes
DROP INDEX IF EXISTS idx_trades_unique_composite;
DROP TRIGGER IF EXISTS normalize_trade_data_trigger ON public.trades;
DROP TRIGGER IF EXISTS prevent_orphaned_trades_trigger ON public.trades;
DROP FUNCTION IF EXISTS normalize_trade_data();
DROP FUNCTION IF EXISTS prevent_orphaned_trades();
DROP VIEW IF EXISTS public.trade_analysis;

-- =====================================================
-- 2. ENSURE ALL TABLES EXIST WITH CORRECT SCHEMA
-- =====================================================

-- Journals table
CREATE TABLE IF NOT EXISTS public.journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  prop_firm TEXT,
  account_size DECIMAL(15,2) CHECK (account_size IS NULL OR account_size >= 0),
  broker TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.journals IS 'Trading journals for organizing trades by account, strategy, or prop firm';

-- Raw trade data table
CREATE TABLE IF NOT EXISTS public.raw_trade_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_name TEXT,
  headers TEXT[] NOT NULL DEFAULT '{}',
  data JSONB NOT NULL DEFAULT '{}'
);

-- Trade sessions table
CREATE TABLE IF NOT EXISTS public.trade_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  raw_data_id UUID REFERENCES public.raw_trade_data(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Performance metrics (using DECIMAL for precision)
  total_pnl DECIMAL(15,2) DEFAULT 0,
  total_trades INTEGER DEFAULT 0 CHECK (total_trades >= 0),
  win_rate DECIMAL(5,2) DEFAULT 0 CHECK (win_rate >= 0 AND win_rate <= 100),
  avg_win DECIMAL(15,2) DEFAULT 0,
  avg_loss DECIMAL(15,2) DEFAULT 0,
  max_drawdown DECIMAL(15,2) DEFAULT 0,
  profit_factor DECIMAL(10,2) DEFAULT 0 CHECK (profit_factor >= 0),
  expectancy DECIMAL(15,2) DEFAULT 0,
  largest_win DECIMAL(15,2) DEFAULT 0,
  largest_loss DECIMAL(15,2) DEFAULT 0,
  max_win_streak INTEGER DEFAULT 0 CHECK (max_win_streak >= 0),
  max_loss_streak INTEGER DEFAULT 0 CHECK (max_loss_streak >= 0),
  reward_risk_ratio DECIMAL(10,2) DEFAULT 0,
  
  -- JSON data
  equity_curve JSONB DEFAULT '[]',
  time_data JSONB DEFAULT '[]',
  trades_by_day JSONB DEFAULT '[]',
  trades_by_symbol JSONB DEFAULT '[]',
  
  -- AI insights
  ai_strengths TEXT[] DEFAULT '{}',
  ai_mistakes TEXT[] DEFAULT '{}',
  ai_fixes TEXT[] DEFAULT '{}',
  ai_key_insight TEXT
);

-- Add unique constraint on raw_data_id
ALTER TABLE public.trade_sessions 
DROP CONSTRAINT IF EXISTS trade_sessions_raw_data_id_key;
ALTER TABLE public.trade_sessions 
ADD CONSTRAINT trade_sessions_raw_data_id_key UNIQUE (raw_data_id);

-- Trades table
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.trade_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Trade data (using DECIMAL for financial precision)
  datetime TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL CHECK (length(trim(symbol)) > 0),
  side TEXT NOT NULL CHECK (upper(side) IN ('BUY', 'SELL', 'LONG', 'SHORT')),
  qty DECIMAL(15,4) NOT NULL CHECK (qty > 0),
  price DECIMAL(15,4) NOT NULL CHECK (price > 0),
  pnl DECIMAL(15,2) NOT NULL,
  
  -- Optional fields
  notes TEXT,
  strategy TEXT,
  tags TEXT[] DEFAULT '{}',
  image_url TEXT
);

-- =====================================================
-- 3. ADD MISSING COLUMNS TO EXISTING TABLES
-- =====================================================

-- Add missing columns to trade_sessions if they don't exist
DO $$ 
BEGIN
  -- Add journal_id if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'journal_id') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN journal_id UUID REFERENCES public.journals(id) ON DELETE CASCADE;
  END IF;
  
  -- Add other missing columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'profit_factor') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN profit_factor DECIMAL(10,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'expectancy') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN expectancy DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'largest_win') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN largest_win DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'largest_loss') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN largest_loss DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'max_win_streak') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN max_win_streak INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'max_loss_streak') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN max_loss_streak INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'reward_risk_ratio') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN reward_risk_ratio DECIMAL(10,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'trades_by_day') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN trades_by_day JSONB DEFAULT '[]';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trade_sessions' AND column_name = 'trades_by_symbol') THEN
    ALTER TABLE public.trade_sessions ADD COLUMN trades_by_symbol JSONB DEFAULT '[]';
  END IF;
END $$;

-- Add missing columns to trades if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'journal_id') THEN
    ALTER TABLE public.trades ADD COLUMN journal_id UUID REFERENCES public.journals(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'strategy') THEN
    ALTER TABLE public.trades ADD COLUMN strategy TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'tags') THEN
    ALTER TABLE public.trades ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'image_url') THEN
    ALTER TABLE public.trades ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- =====================================================
-- 4. FIX DATA INTEGRITY ISSUES
-- =====================================================

-- Update any existing trades that have NULL journal_id
UPDATE public.trades 
SET journal_id = ts.journal_id 
FROM public.trade_sessions ts 
WHERE trades.session_id = ts.id 
AND trades.journal_id IS NULL
AND ts.journal_id IS NOT NULL;

-- Delete orphaned trades that can't be fixed
DELETE FROM public.trades WHERE journal_id IS NULL;

-- Delete orphaned trade_sessions without journal_id
DELETE FROM public.trade_sessions WHERE journal_id IS NULL;

-- Make journal_id NOT NULL in both tables
ALTER TABLE public.trades ALTER COLUMN journal_id SET NOT NULL;
ALTER TABLE public.trade_sessions ALTER COLUMN journal_id SET NOT NULL;

-- =====================================================
-- 5. CLEAN UP DUPLICATE DATA
-- =====================================================

-- Remove duplicate trades (keep the one with lowest id)
WITH duplicate_trades AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        journal_id, 
        datetime, 
        UPPER(TRIM(COALESCE(symbol, ''))),
        UPPER(TRIM(COALESCE(side, ''))),
        COALESCE(qty, 0),
        COALESCE(price, 0),
        COALESCE(pnl, 0)
      ORDER BY id ASC
    ) as row_num
  FROM public.trades
)
DELETE FROM public.trades 
WHERE id IN (
  SELECT id FROM duplicate_trades WHERE row_num > 1
);

-- =====================================================
-- 6. CREATE COMPREHENSIVE INDEXES
-- =====================================================

-- Primary performance indexes
CREATE INDEX IF NOT EXISTS idx_trades_journal_datetime ON public.trades(journal_id, datetime DESC);
CREATE INDEX IF NOT EXISTS idx_trades_session_id ON public.trades(session_id);
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON public.trades(symbol) WHERE symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_pnl ON public.trades(pnl);

CREATE INDEX IF NOT EXISTS idx_trade_sessions_journal_id ON public.trade_sessions(journal_id);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_user_id ON public.trade_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_created_at ON public.trade_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journals_user_id ON public.journals(user_id);
CREATE INDEX IF NOT EXISTS idx_raw_trade_data_user_id ON public.raw_trade_data(user_id);

-- Unique constraint for duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_unique_composite 
ON public.trades (
  journal_id, 
  datetime, 
  UPPER(TRIM(symbol)), 
  UPPER(TRIM(side)), 
  qty, 
  price, 
  pnl
);

-- =====================================================
-- 7. CREATE DATA VALIDATION FUNCTIONS
-- =====================================================

-- Function to normalize and validate trade data
CREATE OR REPLACE FUNCTION normalize_trade_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalize symbol and side
  NEW.symbol := UPPER(TRIM(NEW.symbol));
  NEW.side := UPPER(TRIM(NEW.side));
  
  -- Convert side variations
  IF NEW.side IN ('LONG', 'L') THEN
    NEW.side := 'BUY';
  ELSIF NEW.side IN ('SHORT', 'S') THEN
    NEW.side := 'SELL';
  END IF;
  
  -- Validate datetime is not too far in the future
  IF NEW.datetime > NOW() + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Trade datetime cannot be more than 1 day in the future';
  END IF;
  
  -- Validate datetime is not too far in the past (more than 10 years)
  IF NEW.datetime < NOW() - INTERVAL '10 years' THEN
    RAISE EXCEPTION 'Trade datetime cannot be more than 10 years in the past';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure referential integrity
CREATE OR REPLACE FUNCTION validate_trade_references()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure session exists and belongs to the same user and journal
  IF NOT EXISTS (
    SELECT 1 FROM public.trade_sessions 
    WHERE id = NEW.session_id 
    AND user_id = NEW.user_id 
    AND journal_id = NEW.journal_id
  ) THEN
    RAISE EXCEPTION 'Trade session does not exist or does not belong to the specified user and journal';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. CREATE TRIGGERS
-- =====================================================

CREATE TRIGGER normalize_trade_data_trigger
  BEFORE INSERT OR UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION normalize_trade_data();

CREATE TRIGGER validate_trade_references_trigger
  BEFORE INSERT OR UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION validate_trade_references();

-- =====================================================
-- 9. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_trade_data ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 10. CREATE COMPREHENSIVE RLS POLICIES
-- =====================================================

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can manage their own journals" ON public.journals;
DROP POLICY IF EXISTS "Users can view their own journals" ON public.journals;
DROP POLICY IF EXISTS "Users can create their own journals" ON public.journals;
DROP POLICY IF EXISTS "Users can update their own journals" ON public.journals;
DROP POLICY IF EXISTS "Users can delete their own journals" ON public.journals;
DROP POLICY IF EXISTS "Users can manage their own trade sessions" ON public.trade_sessions;
DROP POLICY IF EXISTS "Users can manage their own trades" ON public.trades;
DROP POLICY IF EXISTS "Users can manage their own raw trade data" ON public.raw_trade_data;

-- Create comprehensive policies
CREATE POLICY "journals_user_access" ON public.journals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trade_sessions_user_access" ON public.trade_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trades_user_access" ON public.trades
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "raw_trade_data_user_access" ON public.raw_trade_data
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 11. CREATE UTILITY FUNCTIONS
-- =====================================================

-- Function to get trade statistics for a journal
CREATE OR REPLACE FUNCTION get_journal_stats(journal_uuid UUID)
RETURNS TABLE (
  total_trades BIGINT,
  total_pnl DECIMAL,
  win_rate DECIMAL,
  profit_factor DECIMAL,
  avg_win DECIMAL,
  avg_loss DECIMAL,
  largest_win DECIMAL,
  largest_loss DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_trades,
    COALESCE(SUM(t.pnl), 0) as total_pnl,
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE t.pnl > 0) * 100.0 / COUNT(*))::DECIMAL(5,2)
    END as win_rate,
    CASE 
      WHEN SUM(CASE WHEN t.pnl < 0 THEN ABS(t.pnl) ELSE 0 END) = 0 THEN 
        CASE WHEN SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END) > 0 THEN 9999 ELSE 0 END
      ELSE (SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END) / SUM(CASE WHEN t.pnl < 0 THEN ABS(t.pnl) ELSE 0 END))::DECIMAL(10,2)
    END as profit_factor,
    COALESCE(AVG(t.pnl) FILTER (WHERE t.pnl > 0), 0)::DECIMAL(15,2) as avg_win,
    COALESCE(AVG(t.pnl) FILTER (WHERE t.pnl < 0), 0)::DECIMAL(15,2) as avg_loss,
    COALESCE(MAX(t.pnl), 0)::DECIMAL(15,2) as largest_win,
    COALESCE(MIN(t.pnl), 0)::DECIMAL(15,2) as largest_loss
  FROM public.trades t
  WHERE t.journal_id = journal_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up test/mock data
CREATE OR REPLACE FUNCTION cleanup_mock_data(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- Delete mock trades
  DELETE FROM public.trades 
  WHERE user_id = user_uuid 
  AND (
    UPPER(symbol) IN ('AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT') 
    OR symbol ILIKE '%DEMO%' 
    OR symbol ILIKE '%TEST%'
    OR symbol ILIKE '%SAMPLE%'
    OR notes ILIKE '%mock%'
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 12. CREATE HELPFUL VIEWS
-- =====================================================

-- View for trade analysis
CREATE OR REPLACE VIEW public.trade_analysis_view AS
SELECT 
  t.id,
  t.datetime,
  t.symbol,
  t.side,
  t.qty,
  t.price,
  t.pnl,
  t.notes,
  t.strategy,
  t.tags,
  t.journal_id,
  t.session_id,
  j.name as journal_name,
  j.prop_firm,
  j.broker,
  ts.created_at as session_date,
  ts.total_pnl as session_total_pnl,
  ts.win_rate as session_win_rate,
  t.user_id
FROM public.trades t
JOIN public.journals j ON t.journal_id = j.id
JOIN public.trade_sessions ts ON t.session_id = ts.id;

-- RLS for the view
ALTER VIEW public.trade_analysis_view SET (security_barrier = true);
CREATE POLICY "trade_analysis_view_user_access" ON public.trade_analysis_view
  FOR SELECT USING (user_id = auth.uid());

-- Grant permissions
GRANT SELECT ON public.trade_analysis_view TO authenticated;
GRANT EXECUTE ON FUNCTION get_journal_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_mock_data(UUID) TO authenticated;

-- =====================================================
-- 13. FINAL DATA VALIDATION
-- =====================================================

-- Ensure all trades have proper references
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  -- Check for orphaned trades
  SELECT COUNT(*) INTO orphaned_count
  FROM public.trades t
  LEFT JOIN public.trade_sessions ts ON t.session_id = ts.id
  LEFT JOIN public.journals j ON t.journal_id = j.id
  WHERE ts.id IS NULL OR j.id IS NULL;
  
  IF orphaned_count > 0 THEN
    RAISE NOTICE 'Found % orphaned trades that will be deleted', orphaned_count;
    
    -- Delete orphaned trades
    DELETE FROM public.trades t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.trade_sessions ts WHERE ts.id = t.session_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.journals j WHERE j.id = t.journal_id
    );
  END IF;
END $$;

-- Update trade session metrics for consistency
UPDATE public.trade_sessions ts
SET 
  total_trades = stats.total_trades,
  total_pnl = stats.total_pnl,
  win_rate = stats.win_rate,
  profit_factor = stats.profit_factor,
  avg_win = stats.avg_win,
  avg_loss = stats.avg_loss,
  largest_win = stats.largest_win,
  largest_loss = stats.largest_loss
FROM (
  SELECT 
    t.session_id,
    COUNT(*)::INTEGER as total_trades,
    SUM(t.pnl)::DECIMAL(15,2) as total_pnl,
    (COUNT(*) FILTER (WHERE t.pnl > 0) * 100.0 / COUNT(*))::DECIMAL(5,2) as win_rate,
    CASE 
      WHEN SUM(CASE WHEN t.pnl < 0 THEN ABS(t.pnl) ELSE 0 END) = 0 THEN 
        CASE WHEN SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END) > 0 THEN 9999 ELSE 0 END
      ELSE (SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END) / SUM(CASE WHEN t.pnl < 0 THEN ABS(t.pnl) ELSE 0 END))::DECIMAL(10,2)
    END as profit_factor,
    AVG(t.pnl) FILTER (WHERE t.pnl > 0)::DECIMAL(15,2) as avg_win,
    AVG(t.pnl) FILTER (WHERE t.pnl < 0)::DECIMAL(15,2) as avg_loss,
    MAX(t.pnl)::DECIMAL(15,2) as largest_win,
    MIN(t.pnl)::DECIMAL(15,2) as largest_loss
  FROM public.trades t
  GROUP BY t.session_id
) stats
WHERE ts.id = stats.session_id;