/*
  # Create journal summary RPC function for dashboard performance

  1. Function
    - `get_journal_summary(journal_id)` - Returns aggregated journal metrics
    - Replaces inefficient SELECT * FROM trades queries
    - Uses SQL aggregation for better performance

  2. Returns
    - Total trades, P&L, win rate, best/worst sessions
    - Optimized for dashboard display
*/

CREATE OR REPLACE FUNCTION get_journal_summary(p_journal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  total_trades integer;
  total_pnl numeric;
  win_rate numeric;
  total_sessions integer;
  recent_sessions jsonb;
BEGIN
  -- Get basic metrics
  SELECT 
    COUNT(*),
    COALESCE(SUM(pnl), 0)
  INTO total_trades, total_pnl
  FROM trades 
  WHERE journal_id = p_journal_id;

  -- Calculate win rate
  SELECT 
    CASE 
      WHEN total_trades > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE pnl > 0) * 100.0) / total_trades, 2)
      ELSE 0 
    END
  INTO win_rate
  FROM trades 
  WHERE journal_id = p_journal_id;

  -- Get session count
  SELECT COUNT(*)
  INTO total_sessions
  FROM trade_sessions
  WHERE journal_id = p_journal_id;

  -- Get recent sessions
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'created_at', created_at,
      'total_trades', total_trades,
      'total_pnl', total_pnl,
      'win_rate', win_rate
    ) ORDER BY created_at DESC
  )
  INTO recent_sessions
  FROM (
    SELECT id, created_at, total_trades, total_pnl, win_rate
    FROM trade_sessions
    WHERE journal_id = p_journal_id
    ORDER BY created_at DESC
    LIMIT 10
  ) recent;

  -- Build result
  result := jsonb_build_object(
    'total_trades', total_trades,
    'total_pnl', total_pnl,
    'win_rate', win_rate,
    'total_sessions', total_sessions,
    'recent_sessions', COALESCE(recent_sessions, '[]'::jsonb)
  );

  RETURN result;
END;
$$;