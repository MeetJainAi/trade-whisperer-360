/*
# Create get_journal_summary function

This migration creates the `get_journal_summary` function that aggregates trading statistics for a specific journal.

## Function Details
- **Function Name**: `public.get_journal_summary`
- **Parameters**: `p_journal_id` (uuid) - The journal ID to summarize
- **Returns**: jsonb object with aggregated trading statistics
- **Security**: DEFINER (runs with elevated privileges to access data)

## Aggregated Statistics
- `total_trades`: Total number of trades in the journal
- `total_pnl`: Sum of all P&L values
- `winning_trades`: Count of profitable trades (pnl > 0)
- `losing_trades`: Count of losing trades (pnl < 0)
- `win_rate`: Percentage of winning trades
- `avg_win`: Average profit from winning trades
- `avg_loss`: Average loss from losing trades
- `largest_win`: Maximum single trade profit
- `largest_loss`: Maximum single trade loss
- `total_sessions`: Number of trading sessions

## Permissions
- Granted to `authenticated` and `anon` roles for client access
*/

CREATE OR REPLACE FUNCTION public.get_journal_summary(p_journal_id uuid)
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