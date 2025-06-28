/*
  # Create cleanup_mock_data RPC function

  1. Function Creation
    - Creates an RPC function to clean up mock/demo data
    - Safely handles deletion of test trades
    - Used by the CSV processing to remove any existing demo data

  2. Security
    - Function runs with definer rights for proper access
    - Only deletes data for the specified user
*/

-- Create the cleanup function if it doesn't exist
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