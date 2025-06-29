/*
  # Create trading playbooks table

  1. New Tables
    - `trading_playbooks`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text, required)
      - `strategy_type` (text, optional)
      - `description` (text, optional)
      - `rules` (jsonb, optional)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `trading_playbooks` table
    - Add policy for users to manage their own playbooks

  3. Indexes
    - Add index on user_id for performance
    - Add index on is_active for filtering
*/

CREATE TABLE IF NOT EXISTS trading_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  strategy_type text,
  description text,
  rules jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE trading_playbooks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own playbooks"
  ON trading_playbooks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own playbooks"
  ON trading_playbooks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playbooks"
  ON trading_playbooks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playbooks"
  ON trading_playbooks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trading_playbooks_user_id ON trading_playbooks(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_playbooks_is_active ON trading_playbooks(is_active);
CREATE INDEX IF NOT EXISTS idx_trading_playbooks_created_at ON trading_playbooks(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trading_playbooks_updated_at
  BEFORE UPDATE ON trading_playbooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();