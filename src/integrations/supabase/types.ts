export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      journals: {
        Row: {
          account_size: number | null
          broker: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          prop_firm: string | null
          user_id: string
        }
        Insert: {
          account_size?: number | null
          broker?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          prop_firm?: string | null
          user_id: string
        }
        Update: {
          account_size?: number | null
          broker?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          prop_firm?: string | null
          user_id?: string
        }
        Relationships: []
      }
      raw_trade_data: {
        Row: {
          created_at: string
          data: Json | null
          file_name: string | null
          headers: string[] | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          file_name?: string | null
          headers?: string[] | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          file_name?: string | null
          headers?: string[] | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_sessions: {
        Row: {
          ai_fixes: string[] | null
          ai_key_insight: string | null
          ai_mistakes: string[] | null
          ai_strengths: string[] | null
          avg_loss: number | null
          avg_win: number | null
          created_at: string
          equity_curve: Json | null
          expectancy: number | null
          id: string
          journal_id: string | null
          largest_loss: number | null
          largest_win: number | null
          max_drawdown: number | null
          max_loss_streak: number | null
          max_win_streak: number | null
          profit_factor: number | null
          raw_data_id: string | null
          reward_risk_ratio: number | null
          time_data: Json | null
          total_pnl: number | null
          total_trades: number | null
          trades_by_day: Json | null
          trades_by_symbol: Json | null
          user_id: string
          win_rate: number | null
        }
        Insert: {
          ai_fixes?: string[] | null
          ai_key_insight?: string | null
          ai_mistakes?: string[] | null
          ai_strengths?: string[] | null
          avg_loss?: number | null
          avg_win?: number | null
          created_at?: string
          equity_curve?: Json | null
          expectancy?: number | null
          id?: string
          journal_id?: string | null
          largest_loss?: number | null
          largest_win?: number | null
          max_drawdown?: number | null
          max_loss_streak?: number | null
          max_win_streak?: number | null
          profit_factor?: number | null
          raw_data_id?: string | null
          reward_risk_ratio?: number | null
          time_data?: Json | null
          total_pnl?: number | null
          total_trades?: number | null
          trades_by_day?: Json | null
          trades_by_symbol?: Json | null
          user_id: string
          win_rate?: number | null
        }
        Update: {
          ai_fixes?: string[] | null
          ai_key_insight?: string | null
          ai_mistakes?: string[] | null
          ai_strengths?: string[] | null
          avg_loss?: number | null
          avg_win?: number | null
          created_at?: string
          equity_curve?: Json | null
          expectancy?: number | null
          id?: string
          journal_id?: string | null
          largest_loss?: number | null
          largest_win?: number | null
          max_drawdown?: number | null
          max_loss_streak?: number | null
          max_win_streak?: number | null
          profit_factor?: number | null
          raw_data_id?: string | null
          reward_risk_ratio?: number | null
          time_data?: Json | null
          total_pnl?: number | null
          total_trades?: number | null
          trades_by_day?: Json | null
          trades_by_symbol?: Json | null
          user_id?: string
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_sessions_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_sessions_raw_data_id_fkey"
            columns: ["raw_data_id"]
            isOneToOne: true
            referencedRelation: "raw_trade_data"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          buy_fill_id: string | null
          created_at: string
          datetime: string
          id: string
          image_url: string | null
          journal_id: string | null
          notes: string | null
          pnl: number | null
          price: number | null
          qty: number | null
          sell_fill_id: string | null
          session_id: string
          side: string | null
          strategy: string | null
          symbol: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          buy_fill_id?: string | null
          created_at?: string
          datetime: string
          id?: string
          image_url?: string | null
          journal_id?: string | null
          notes?: string | null
          pnl?: number | null
          price?: number | null
          qty?: number | null
          sell_fill_id?: string | null
          session_id: string
          side?: string | null
          strategy?: string | null
          symbol?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          buy_fill_id?: string | null
          created_at?: string
          datetime?: string
          id?: string
          image_url?: string | null
          journal_id?: string | null
          notes?: string | null
          pnl?: number | null
          price?: number | null
          qty?: number | null
          sell_fill_id?: string | null
          session_id?: string
          side?: string | null
          strategy?: string | null
          symbol?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trade_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const