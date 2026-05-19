export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance_yen: number
          bank_type: string
          color: string
          created_at: string
          credit_limit_yen: number
          id: string
          name: string
          user_id: string
        }
        Insert: {
          balance_yen?: number
          bank_type?: string
          color?: string
          created_at?: string
          credit_limit_yen?: number
          id?: string
          name: string
          user_id: string
        }
        Update: {
          balance_yen?: number
          bank_type?: string
          color?: string
          created_at?: string
          credit_limit_yen?: number
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string
          amount_yen: number
          category: string
          charge_yen: number
          created_at: string
          description: string | null
          expense_date: string
          id: string
          payment_method: string
          receipt_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount_yen: number
          category?: string
          charge_yen?: number
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          receipt_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount_yen?: number
          category?: string
          charge_yen?: number
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          receipt_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          image_path: string
          items: Json
          merchant: string | null
          purchase_date: string | null
          raw_text: string | null
          status: string
          tax_yen: number | null
          total_yen: number | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          image_path: string
          items?: Json
          merchant?: string | null
          purchase_date?: string | null
          raw_text?: string | null
          status?: string
          tax_yen?: number | null
          total_yen?: number | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          image_path?: string
          items?: Json
          merchant?: string | null
          purchase_date?: string | null
          raw_text?: string | null
          status?: string
          tax_yen?: number | null
          total_yen?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_entries: {
        Row: {
          base_pay: number
          created_at: string
          dorm: number
          employment_insurance: number
          fixed_deduction: number
          health_insurance: number
          id: string
          lunch_days: number
          lunch_per_day: number
          net_yen: number
          note: string | null
          overtime_pay: number
          pay_date: string
          pension: number
          period_end: string
          period_start: string
          tax: number
          user_id: string
          working_days: number
        }
        Insert: {
          base_pay?: number
          created_at?: string
          dorm?: number
          employment_insurance?: number
          fixed_deduction?: number
          health_insurance?: number
          id?: string
          lunch_days?: number
          lunch_per_day?: number
          net_yen?: number
          note?: string | null
          overtime_pay?: number
          pay_date: string
          pension?: number
          period_end: string
          period_start: string
          tax?: number
          user_id: string
          working_days?: number
        }
        Update: {
          base_pay?: number
          created_at?: string
          dorm?: number
          employment_insurance?: number
          fixed_deduction?: number
          health_insurance?: number
          id?: string
          lunch_days?: number
          lunch_per_day?: number
          net_yen?: number
          note?: string | null
          overtime_pay?: number
          pay_date?: string
          pension?: number
          period_end?: string
          period_start?: string
          tax?: number
          user_id?: string
          working_days?: number
        }
        Relationships: []
      }
      wise_recipients: {
        Row: {
          created_at: string
          id: string
          min_yen: number
          name: string
          relation: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_yen?: number
          name: string
          relation?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_yen?: number
          name?: string
          relation?: string
          user_id?: string
        }
        Relationships: []
      }
      wise_transfers: {
        Row: {
          amount_sent_yen: number
          charge_yen: number
          created_at: string
          id: string
          inr_received: number
          note: string | null
          recipient_id: string
          transfer_date: string
          user_id: string
        }
        Insert: {
          amount_sent_yen: number
          charge_yen?: number
          created_at?: string
          id?: string
          inr_received: number
          note?: string | null
          recipient_id: string
          transfer_date?: string
          user_id: string
        }
        Update: {
          amount_sent_yen?: number
          charge_yen?: number
          created_at?: string
          id?: string
          inr_received?: number
          note?: string | null
          recipient_id?: string
          transfer_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wise_transfers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "wise_recipients"
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
