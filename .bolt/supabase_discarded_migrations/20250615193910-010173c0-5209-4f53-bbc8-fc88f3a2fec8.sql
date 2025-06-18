
-- Add a column to the `trades` table to link each trade directly to a journal.
-- This will simplify querying for duplicate checks.
ALTER TABLE public.trades
ADD COLUMN journal_id UUID REFERENCES public.journals(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.trades.journal_id IS 'The journal this trade belongs to, for easier querying and duplicate checking.';

-- Add an index on the new column to ensure queries remain fast.
CREATE INDEX idx_trades_journal_id ON public.trades(journal_id);
