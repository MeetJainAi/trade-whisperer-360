/*
# Fix Duplicate Trade Detection

1. Schema Changes
   - Drop the problematic unique index `idx_trades_unique_composite_v2`
   - Add `buy_fill_id` and `sell_fill_id` columns to trades table
   - Create a more flexible duplicate detection system

2. Security
   - Maintain RLS policies
   - Keep essential indexes for performance

3. Flexibility
   - Allow genuine trades with similar attributes
   - Support broker-specific fill IDs when available
*/

-- Drop the problematic unique index that causes genuine trades to be flagged as duplicates
DROP INDEX IF EXISTS idx_trades_unique_composite_v2;

-- Add new columns for broker-specific fill IDs
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS buy_fill_id text,
ADD COLUMN IF NOT EXISTS sell_fill_id text;

-- Create indexes for the new columns (for performance when they're used)
CREATE INDEX IF NOT EXISTS idx_trades_buy_fill_id ON trades(buy_fill_id) WHERE buy_fill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_sell_fill_id ON trades(sell_fill_id) WHERE sell_fill_id IS NOT NULL;

-- Create a more flexible composite index that can help with performance but doesn't enforce strict uniqueness
CREATE INDEX IF NOT EXISTS idx_trades_dedup_helper ON trades(journal_id, datetime, symbol_normalized, side_normalized, qty, price, pnl);

-- Update the RPC function to use the new flexible approach
CREATE OR REPLACE FUNCTION get_duplicate_trades_flexible(
  p_journal_id uuid,
  p_trades jsonb
)
RETURNS TABLE(trade_index integer, is_duplicate boolean, match_type text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  trade_record jsonb;
  i integer := 0;
  existing_count integer;
  has_fill_ids boolean;
BEGIN
  FOR trade_record IN SELECT * FROM jsonb_array_elements(p_trades)
  LOOP
    -- Check if this trade has fill IDs
    has_fill_ids := (trade_record->>'buy_fill_id') IS NOT NULL 
                   AND (trade_record->>'sell_fill_id') IS NOT NULL;
    
    IF has_fill_ids THEN
      -- Use fill ID matching (most precise)
      SELECT COUNT(*) INTO existing_count
      FROM trades
      WHERE journal_id = p_journal_id
        AND buy_fill_id = (trade_record->>'buy_fill_id')
        AND sell_fill_id = (trade_record->>'sell_fill_id');
      
      IF existing_count > 0 THEN
        RETURN QUERY SELECT i, true, 'fill_id';
      ELSE
        RETURN QUERY SELECT i, false, 'fill_id';
      END IF;
    ELSE
      -- Use flexible composite matching (less strict than before)
      SELECT COUNT(*) INTO existing_count
      FROM trades
      WHERE journal_id = p_journal_id
        AND datetime = (trade_record->>'datetime')::timestamptz
        AND UPPER(TRIM(symbol)) = UPPER(TRIM(trade_record->>'symbol'))
        AND UPPER(TRIM(side)) = UPPER(TRIM(trade_record->>'side'))
        AND qty = (trade_record->>'qty')::real
        AND ABS(price - (trade_record->>'price')::real) < 0.01  -- Allow small price differences
        AND ABS(pnl - (trade_record->>'pnl')::real) < 0.01;    -- Allow small PnL differences
      
      IF existing_count > 0 THEN
        RETURN QUERY SELECT i, true, 'composite';
      ELSE
        RETURN QUERY SELECT i, false, 'composite';
      END IF;
    END IF;
    
    i := i + 1;
  END LOOP;
END;
$$;