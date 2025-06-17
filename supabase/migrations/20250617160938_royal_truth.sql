/*
  # Fix trades table duplicates and add proper constraints

  1. Database Schema Fixes
    - Update NULL journal_id values in existing trades
    - Make journal_id NOT NULL to prevent future issues
    - Add unique constraint to prevent duplicates at database level
    - Clean up any existing duplicates

  2. Security
    - Maintains existing RLS policies
    - Preserves data integrity
*/

-- First, update any existing trades that have NULL journal_id
UPDATE trades 
SET journal_id = ts.journal_id 
FROM trade_sessions ts 
WHERE trades.session_id = ts.id 
AND trades.journal_id IS NULL;

-- Create a function to clean up any existing duplicates before applying constraints
CREATE OR REPLACE FUNCTION remove_duplicate_trades()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remove duplicate trades, keeping only the first occurrence (lowest id)
  DELETE FROM trades a USING trades b
  WHERE a.id > b.id
  AND a.journal_id = b.journal_id
  AND a.datetime = b.datetime
  AND COALESCE(a.symbol, '') = COALESCE(b.symbol, '')
  AND COALESCE(a.side, '') = COALESCE(b.side, '')
  AND COALESCE(a.qty, 0) = COALESCE(b.qty, 0)
  AND COALESCE(a.price, 0) = COALESCE(b.price, 0)
  AND COALESCE(a.pnl, 0) = COALESCE(b.pnl, 0);
END;
$$;

-- Run the cleanup function
SELECT remove_duplicate_trades();

-- Drop the cleanup function as it's no longer needed
DROP FUNCTION remove_duplicate_trades();

-- Now make journal_id NOT NULL to prevent future issues
ALTER TABLE trades ALTER COLUMN journal_id SET NOT NULL;

-- Create a unique constraint to prevent actual duplicates at database level
-- This is much more reliable than application-level checking
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_unique_composite 
ON trades (journal_id, datetime, symbol, side, qty, price, pnl)
WHERE symbol IS NOT NULL;