/*
  # Create get_journal_summary Function

  1. Function Creation
    - Drop existing function if it exists to avoid return type conflicts
    - Create new function that aggregates trade data for a journal
    - Returns comprehensive statistics as JSONB
    
  2. Security
    - Grant execute permissions to authenticated and anonymous users
    - Function uses SECURITY DEFINER for consistent permissions
    
  3. Performance
    - Refreshes PostgREST cache for immediate availability
*/

-- Drop the existing function if it exists to avoid return type conflicts
DROP FUNCTION IF EXISTS public.get_journal_summary(uuid);

-- Create the journal summary function
CREATE FUNCTION public.get_journal_summary(p_journal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_trades', COALESCE(COUNT(t.id), 0),
    'total_pnl', COALESCE(SUM(t.pnl), 0),
    'winning_trades', COALESCE(COUNT(t.id) FILTER (WHERE t.pnl > 0), 0),
    'losing_trades', COALESCE(COUNT(t.id) FILTER (WHERE t.pnl < 0), 0),
    'win_rate', CASE 
      WHEN COUNT(t.id) > 0 THEN 
        ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.pnl > 0) / COUNT(t.id), 2)
      ELSE 0 
    END,
    'avg_win', CASE 
      WHEN COUNT(t.id) FILTER (WHERE t.pnl > 0) > 0 THEN
        ROUND(AVG(t.pnl) FILTER (WHERE t.pnl > 0), 2)
      ELSE 0
    END,
    'avg_loss', CASE 
      WHEN COUNT(t.id) FILTER (WHERE t.pnl < 0) > 0 THEN
        ROUND(AVG(t.pnl) FILTER (WHERE t.pnl < 0), 2)
      ELSE 0
    END,
    'largest_win', COALESCE(MAX(t.pnl) FILTER (WHERE t.pnl > 0), 0),
    'largest_loss', COALESCE(MIN(t.pnl) FILTER (WHERE t.pnl < 0), 0),
    'total_sessions', COALESCE(COUNT(DISTINCT t.session_id), 0),
    'last_trade_date', MAX(t.datetime)
  )
  INTO result
  FROM trades t
  WHERE t.journal_id = p_journal_id;
  
  RETURN result;
END;
$$;

-- Grant execute permissions to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.get_journal_summary(uuid) TO authenticated, anon;

-- Refresh the PostgREST schema cache to make the function immediately available
NOTIFY pgrst, 'reload config';