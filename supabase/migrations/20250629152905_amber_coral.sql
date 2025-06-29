/*
  # Create Trading Playbook System

  1. New Tables
    - `trading_playbooks` - Store detailed trading strategies/playbooks
    - `custom_field_options` - Store user's custom options for trade journal fields
    - `playbook_performance` - Track performance metrics for each playbook

  2. Security
    - Enable RLS on all new tables
    - Add policies for user access control

  3. Features
    - Detailed playbook creation with AI assistance
    - Custom field options stored per user
    - Performance tracking per playbook
    - Rich text content support
*/

-- Create trading_playbooks table
CREATE TABLE IF NOT EXISTS trading_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  strategy_type text,
  market_conditions text,
  entry_criteria jsonb,
  exit_criteria jsonb,
  risk_management jsonb,
  psychology_notes text,
  detailed_content text,
  ai_generated_insights text,
  tags text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create custom_field_options table
CREATE TABLE IF NOT EXISTS custom_field_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL,
  option_value text NOT NULL,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, field_name, option_value)
);

-- Create playbook_performance table
CREATE TABLE IF NOT EXISTS playbook_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  playbook_id uuid REFERENCES trading_playbooks(id) ON DELETE CASCADE NOT NULL,
  total_trades integer DEFAULT 0,
  winning_trades integer DEFAULT 0,
  total_pnl numeric DEFAULT 0,
  avg_win numeric DEFAULT 0,
  avg_loss numeric DEFAULT 0,
  max_win numeric DEFAULT 0,
  max_loss numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  profit_factor numeric DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(user_id, playbook_id)
);

-- Add playbook_id to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS playbook_id uuid REFERENCES trading_playbooks(id);

-- Enable RLS
ALTER TABLE trading_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_performance ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for trading_playbooks
CREATE POLICY "Users can view own playbooks"
  ON trading_playbooks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own playbooks"
  ON trading_playbooks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playbooks"
  ON trading_playbooks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playbooks"
  ON trading_playbooks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create RLS policies for custom_field_options
CREATE POLICY "Users can view own custom options"
  ON custom_field_options
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own custom options"
  ON custom_field_options
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom options"
  ON custom_field_options
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom options"
  ON custom_field_options
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create RLS policies for playbook_performance
CREATE POLICY "Users can view own playbook performance"
  ON playbook_performance
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own playbook performance"
  ON playbook_performance
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playbook performance"
  ON playbook_performance
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trading_playbooks_user_id ON trading_playbooks(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_playbooks_active ON trading_playbooks(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_custom_field_options_user_field ON custom_field_options(user_id, field_name);
CREATE INDEX IF NOT EXISTS idx_playbook_performance_user_playbook ON playbook_performance(user_id, playbook_id);
CREATE INDEX IF NOT EXISTS idx_trades_playbook_id ON trades(playbook_id) WHERE playbook_id IS NOT NULL;

-- Create function to update playbook performance
CREATE OR REPLACE FUNCTION update_playbook_performance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update performance metrics when a trade is inserted/updated/deleted
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.playbook_id IS NOT NULL THEN
      INSERT INTO playbook_performance (user_id, playbook_id, total_trades, winning_trades, total_pnl, win_rate, last_updated)
      SELECT 
        NEW.user_id,
        NEW.playbook_id,
        COUNT(*),
        COUNT(*) FILTER (WHERE pnl > 0),
        COALESCE(SUM(pnl), 0),
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE pnl > 0) * 100.0) / COUNT(*), 2) ELSE 0 END,
        now()
      FROM trades 
      WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id
      ON CONFLICT (user_id, playbook_id) 
      DO UPDATE SET
        total_trades = EXCLUDED.total_trades,
        winning_trades = EXCLUDED.winning_trades,
        total_pnl = EXCLUDED.total_pnl,
        win_rate = EXCLUDED.win_rate,
        avg_win = CASE WHEN EXCLUDED.winning_trades > 0 THEN 
          (SELECT ROUND(AVG(pnl), 2) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl > 0)
          ELSE 0 END,
        avg_loss = CASE WHEN (EXCLUDED.total_trades - EXCLUDED.winning_trades) > 0 THEN 
          (SELECT ROUND(AVG(pnl), 2) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl < 0)
          ELSE 0 END,
        max_win = (SELECT COALESCE(MAX(pnl), 0) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl > 0),
        max_loss = (SELECT COALESCE(MIN(pnl), 0) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl < 0),
        profit_factor = CASE WHEN (SELECT SUM(ABS(pnl)) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl < 0) > 0 THEN
          (SELECT SUM(pnl) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl > 0) / 
          (SELECT SUM(ABS(pnl)) FROM trades WHERE playbook_id = NEW.playbook_id AND user_id = NEW.user_id AND pnl < 0)
          ELSE 0 END,
        last_updated = now();
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for playbook performance updates
DROP TRIGGER IF EXISTS trigger_update_playbook_performance ON trades;
CREATE TRIGGER trigger_update_playbook_performance
  AFTER INSERT OR UPDATE OR DELETE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_playbook_performance();

-- Create function to increment custom field option usage
CREATE OR REPLACE FUNCTION increment_custom_option_usage(
  p_user_id uuid,
  p_field_name text,
  p_option_value text
)
RETURNS void AS $$
BEGIN
  INSERT INTO custom_field_options (user_id, field_name, option_value, usage_count)
  VALUES (p_user_id, p_field_name, p_option_value, 1)
  ON CONFLICT (user_id, field_name, option_value)
  DO UPDATE SET usage_count = custom_field_options.usage_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;