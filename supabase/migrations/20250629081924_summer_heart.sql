/*
  # Fix get_journal_summary function

  1. Changes
    - Drop existing function to avoid return type conflict
    - Recreate function with proper table aliases to resolve ambiguous column references
    - Maintain same functionality with proper column qualification

  2. Security
    - Function remains SECURITY DEFINER for RLS bypass
    - Still filters by user_id parameter for security
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_journal_summary(uuid);

-- Recreate the function with proper table qualification
CREATE OR REPLACE FUNCTION get_journal_summary(target_user_id uuid)
RETURNS TABLE (
  journal_id uuid,
  journal_name text,
  prop_firm text,
  broker text,
  total_trades bigint,
  total_pnl numeric,
  win_rate numeric,
  last_session_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as journal_id,
    j.name as journal_name,
    j.prop_firm,
    j.broker,
    COALESCE(SUM(ts.total_trades), 0) as total_trades,
    COALESCE(SUM(ts.total_pnl), 0) as total_pnl,
    CASE 
      WHEN COUNT(ts.id) > 0 THEN
        ROUND(AVG(ts.win_rate), 2)
      ELSE 0
    END as win_rate,
    MAX(ts.created_at) as last_session_date
  FROM journals j
  LEFT JOIN trade_sessions ts ON j.id = ts.journal_id
  WHERE j.user_id = target_user_id
  GROUP BY j.id, j.name, j.prop_firm, j.broker
  ORDER BY j.created_at DESC;
END;
$$;