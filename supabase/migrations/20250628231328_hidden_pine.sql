/*
  # Fix duplicate detection and constraint issues

  1. Changes to trades table
    - Modify the unique constraint to be more predictable
    - Add computed columns for consistent normalization
    - Add helper function for duplicate detection

  2. Security
    - Maintain all existing RLS policies
    - Ensure referential integrity
*/

-- Drop the existing unique index
DROP INDEX IF EXISTS idx_trades_unique_composite;

-- Add computed columns for normalized values
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS symbol_normalized text GENERATED ALWAYS AS (upper(trim(symbol))) STORED,
ADD COLUMN IF NOT EXISTS side_normalized text GENERATED ALWAYS AS (upper(trim(side))) STORED;

-- Create new unique constraint using computed columns for better predictability
CREATE UNIQUE INDEX idx_trades_unique_composite_v2 ON trades 
(journal_id, datetime, symbol_normalized, side_normalized, qty, price, pnl);

-- Create function to check for existing trades
CREATE OR REPLACE FUNCTION check_trade_exists(
  p_journal_id UUID,
  p_datetime TIMESTAMPTZ,
  p_symbol TEXT,
  p_side TEXT,
  p_qty REAL,
  p_price REAL,
  p_pnl REAL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM trades 
    WHERE journal_id = p_journal_id
    AND datetime = p_datetime
    AND upper(trim(symbol)) = upper(trim(p_symbol))
    AND upper(trim(side)) = upper(trim(p_side))
    AND qty = p_qty
    AND price = p_price
    AND pnl = p_pnl
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for batch duplicate detection
CREATE OR REPLACE FUNCTION get_duplicate_trades(
  p_journal_id UUID,
  p_trades JSONB
)
RETURNS TABLE(trade_index INT, is_duplicate BOOLEAN) AS $$
DECLARE
  trade_item JSONB;
  idx INT := 0;
BEGIN
  FOR trade_item IN SELECT * FROM jsonb_array_elements(p_trades)
  LOOP
    RETURN QUERY SELECT 
      idx,
      check_trade_exists(
        p_journal_id,
        (trade_item->>'datetime')::TIMESTAMPTZ,
        trade_item->>'symbol',
        trade_item->>'side',
        (trade_item->>'qty')::REAL,
        (trade_item->>'price')::REAL,
        (trade_item->>'pnl')::REAL
      );
    idx := idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing trades to populate the computed columns (they'll auto-populate for new records)
UPDATE trades SET symbol = symbol, side = side WHERE symbol_normalized IS NULL OR side_normalized IS NULL;

-- Add index on the original datetime for better performance
CREATE INDEX IF NOT EXISTS idx_trades_datetime ON trades (datetime);
CREATE INDEX IF NOT EXISTS idx_trades_journal_datetime_v2 ON trades (journal_id, datetime DESC);