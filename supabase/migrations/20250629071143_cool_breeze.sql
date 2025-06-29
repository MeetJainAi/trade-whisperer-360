-- Create enhanced duplicate detection function
CREATE OR REPLACE FUNCTION get_duplicate_trades_enhanced(
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
  has_both_fills boolean;
  has_any_fill boolean;
  buy_fill_id_val text;
  sell_fill_id_val text;
BEGIN
  FOR trade_record IN SELECT * FROM jsonb_array_elements(p_trades)
  LOOP
    -- Extract fill IDs
    buy_fill_id_val := trade_record->>'buy_fill_id';
    sell_fill_id_val := trade_record->>'sell_fill_id';
    
    -- Determine fill ID availability
    has_both_fills := (buy_fill_id_val IS NOT NULL AND buy_fill_id_val != '') 
                     AND (sell_fill_id_val IS NOT NULL AND sell_fill_id_val != '');
    has_any_fill := (buy_fill_id_val IS NOT NULL AND buy_fill_id_val != '') 
                   OR (sell_fill_id_val IS NOT NULL AND sell_fill_id_val != '');
    
    -- Strategy 1: Both fill IDs present (highest precision) + P&L check
    IF has_both_fills THEN
      SELECT COUNT(*) INTO existing_count
      FROM trades
      WHERE journal_id = p_journal_id
        AND buy_fill_id = buy_fill_id_val
        AND sell_fill_id = sell_fill_id_val
        AND ABS(pnl - (trade_record->>'pnl')::real) < 0.005;
      
      IF existing_count > 0 THEN
        RETURN QUERY SELECT i, true, 'both_fills';
      ELSE
        RETURN QUERY SELECT i, false, 'both_fills_no_match';
      END IF;
    
    -- Strategy 2: Single fill ID matching (medium precision) + P&L check
    ELSIF has_any_fill THEN
      existing_count := 0;
      
      -- Check buy fill ID match with P&L verification
      IF buy_fill_id_val IS NOT NULL AND buy_fill_id_val != '' THEN
        SELECT COUNT(*) INTO existing_count
        FROM trades
        WHERE journal_id = p_journal_id
          AND buy_fill_id = buy_fill_id_val
          AND datetime = (trade_record->>'datetime')::timestamptz
          AND UPPER(TRIM(symbol)) = UPPER(TRIM(trade_record->>'symbol'))
          AND ABS(pnl - (trade_record->>'pnl')::real) < 0.005;
      END IF;
      
      -- Check sell fill ID match with P&L verification if buy didn't match
      IF existing_count = 0 AND sell_fill_id_val IS NOT NULL AND sell_fill_id_val != '' THEN
        SELECT COUNT(*) INTO existing_count
        FROM trades
        WHERE journal_id = p_journal_id
          AND sell_fill_id = sell_fill_id_val
          AND datetime = (trade_record->>'datetime')::timestamptz
          AND UPPER(TRIM(symbol)) = UPPER(TRIM(trade_record->>'symbol'))
          AND ABS(pnl - (trade_record->>'pnl')::real) < 0.005;
      END IF;
      
      IF existing_count > 0 THEN
        RETURN QUERY SELECT i, true, 'single_fill';
      ELSE
        RETURN QUERY SELECT i, false, 'single_fill_no_match';
      END IF;
    
    -- Strategy 3: Enhanced composite matching (fallback)
    ELSE
      SELECT COUNT(*) INTO existing_count
      FROM trades
      WHERE journal_id = p_journal_id
        AND datetime = (trade_record->>'datetime')::timestamptz
        AND UPPER(TRIM(symbol)) = UPPER(TRIM(trade_record->>'symbol'))
        AND UPPER(TRIM(side)) = UPPER(TRIM(trade_record->>'side'))
        AND qty = (trade_record->>'qty')::real
        AND ABS(price - (trade_record->>'price')::real) < 0.005  -- Tighter price tolerance
        AND ABS(pnl - (trade_record->>'pnl')::real) < 0.005;    -- Tighter PnL tolerance
      
      IF existing_count > 0 THEN
        RETURN QUERY SELECT i, true, 'enhanced_composite';
      ELSE
        RETURN QUERY SELECT i, false, 'enhanced_composite_no_match';
      END IF;
    END IF;
    
    i := i + 1;
  END LOOP;
END;
$$;

-- Create index for better performance on fill ID queries
CREATE INDEX IF NOT EXISTS idx_trades_fill_ids_combined 
ON trades(journal_id, buy_fill_id, sell_fill_id) 
WHERE buy_fill_id IS NOT NULL OR sell_fill_id IS NOT NULL;

-- Create index for enhanced composite matching
CREATE INDEX IF NOT EXISTS idx_trades_enhanced_composite 
ON trades(journal_id, datetime, symbol, side, qty) 
WHERE symbol IS NOT NULL AND side IS NOT NULL;