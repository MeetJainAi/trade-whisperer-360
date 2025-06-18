/*
  # Add missing foreign key constraint for trades.session_id

  1. Foreign Key Addition
    - Add foreign key constraint linking `trades.session_id` to `trade_sessions.id`
    - This will enable Supabase's PostgREST API to recognize the relationship
    - Allows for proper JOIN queries using select('*, trades(*)')

  2. Safety Considerations
    - Uses IF NOT EXISTS pattern to prevent errors if constraint already exists
    - Includes ON DELETE CASCADE to maintain referential integrity
*/

-- Add foreign key constraint for trades.session_id referencing trade_sessions.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'trades_session_id_fkey' 
    AND table_name = 'trades'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE trades 
    ADD CONSTRAINT trades_session_id_fkey 
    FOREIGN KEY (session_id) 
    REFERENCES trade_sessions(id) 
    ON DELETE CASCADE;
  END IF;
END $$;