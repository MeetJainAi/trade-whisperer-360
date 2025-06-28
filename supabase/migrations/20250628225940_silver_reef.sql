-- Drop the existing function if it exists to avoid return type conflict
DROP FUNCTION IF EXISTS cleanup_mock_data(UUID);

-- Create the cleanup function with proper return type
CREATE OR REPLACE FUNCTION cleanup_mock_data(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- Delete trades that appear to be mock data
  DELETE FROM trades 
  WHERE user_id = user_uuid 
  AND (
    notes ILIKE '%Mock trade%' OR
    symbol IN ('AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE') OR
    symbol ILIKE '%TEST%' OR
    symbol ILIKE '%DEMO%' OR
    symbol ILIKE '%SAMPLE%'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;