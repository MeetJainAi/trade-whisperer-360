/*
  # Create custom field options table and functions

  1. New Table
    - `custom_field_options` - Stores user-defined quick options for trade journal fields
    - Tracks usage count for sorting by popularity
    - Supports multiple field types (reasoning, emotions, lessons, mistakes)

  2. New Functions
    - `increment_custom_option_usage` - Updates usage count when an option is used
    - `get_custom_field_options` - Retrieves options for a specific user and field

  3. Security
    - Row-level security policies to ensure users can only access their own options
    - SECURITY DEFINER functions for proper access control
*/

-- Create custom_field_options table if it doesn't exist
CREATE TABLE IF NOT EXISTS custom_field_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL,
  option_value text NOT NULL,
  usage_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, field_name, option_value)
);

-- Enable row level security
ALTER TABLE custom_field_options ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own custom options"
  ON custom_field_options
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom options"
  ON custom_field_options
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom options"
  ON custom_field_options
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom options"
  ON custom_field_options
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to increment usage count or insert new option
CREATE OR REPLACE FUNCTION increment_custom_option_usage(
  p_user_id uuid,
  p_field_name text,
  p_option_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO custom_field_options (user_id, field_name, option_value, usage_count)
  VALUES (p_user_id, p_field_name, p_option_value, 1)
  ON CONFLICT (user_id, field_name, option_value)
  DO UPDATE SET 
    usage_count = custom_field_options.usage_count + 1,
    created_at = now();
END;
$$;

-- Create function to get options for a specific field
CREATE OR REPLACE FUNCTION get_custom_field_options(
  p_user_id uuid,
  p_field_name text
)
RETURNS SETOF custom_field_options
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM custom_field_options
  WHERE user_id = p_user_id
    AND field_name = p_field_name
  ORDER BY usage_count DESC, created_at DESC
  LIMIT 20;
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_custom_field_options_user_field
  ON custom_field_options(user_id, field_name, usage_count DESC);

-- Grant permissions
GRANT EXECUTE ON FUNCTION increment_custom_option_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_custom_field_options TO authenticated;