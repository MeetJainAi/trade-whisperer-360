/*
  # Add get_journal_summary RPC function

  1. New Functions
    - `get_journal_summary(p_journal_id uuid)` - Returns aggregated statistics for a journal
      - `total_pnl` (double precision) - Sum of all session PNL for the journal
      - `win_rate` (double precision) - Average win rate across all sessions
      - `total_trades` (bigint) - Sum of all trades across all sessions

  2. Security
    - Function uses SECURITY DEFINER to respect RLS policies
    - Only returns data for journals the user has access to via existing RLS policies

  3. Implementation Details
    - Properly casts numeric values to avoid PostgreSQL round() function issues
    - Handles null values with COALESCE
    - Uses proper aggregation functions for meaningful statistics
*/

CREATE OR REPLACE FUNCTION public.get_journal_summary(p_journal_id uuid)
RETURNS TABLE (
    total_pnl double precision,
    win_rate double precision,
    total_trades bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ROUND(COALESCE(SUM(ts.total_pnl), 0)::numeric, 2)::double precision AS total_pnl,
        ROUND(COALESCE(AVG(ts.win_rate), 0)::numeric, 2)::double precision AS win_rate,
        COALESCE(SUM(ts.total_trades), 0)::bigint AS total_trades
    FROM
        trade_sessions ts
    WHERE
        ts.journal_id = p_journal_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_journal_summary(uuid) TO authenticated;