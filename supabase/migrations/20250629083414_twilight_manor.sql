-- Drop existing function if it exists (with any parameter signature)
DROP FUNCTION IF EXISTS public.get_journal_summary(uuid);

-- Create the new function with the correct signature
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