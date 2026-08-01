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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      company_settings: {
        Row: {
          address_line: string
          bank_name: string
          bic: string
          city: string
          company_name: string
          country: string
          created_at: string
          email: string
          iban: string
          id: string
          payment_terms_days: number
          phone: string
          postal_code: string
          tax_number: string
          updated_at: string
          user_id: string
          vat_id: string
        }
        Insert: {
          address_line?: string
          bank_name?: string
          bic?: string
          city?: string
          company_name?: string
          country?: string
          created_at?: string
          email?: string
          iban?: string
          id?: string
          payment_terms_days?: number
          phone?: string
          postal_code?: string
          tax_number?: string
          updated_at?: string
          user_id: string
          vat_id?: string
        }
        Update: {
          address_line?: string
          bank_name?: string
          bic?: string
          city?: string
          company_name?: string
          country?: string
          created_at?: string
          email?: string
          iban?: string
          id?: string
          payment_terms_days?: number
          phone?: string
          postal_code?: string
          tax_number?: string
          updated_at?: string
          user_id?: string
          vat_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address_line: string
          city: string
          company: string
          country: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string
          phone: string
          postal_code: string
          updated_at: string
          user_id: string
          vat_id: string
        }
        Insert: {
          address_line?: string
          city?: string
          company?: string
          country?: string
          created_at?: string
          email?: string
          id?: string
          name: string
          notes?: string
          phone?: string
          postal_code?: string
          updated_at?: string
          user_id: string
          vat_id?: string
        }
        Update: {
          address_line?: string
          city?: string
          company?: string
          country?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string
          phone?: string
          postal_code?: string
          updated_at?: string
          user_id?: string
          vat_id?: string
        }
        Relationships: []
      }
      document_items: {
        Row: {
          created_at: string
          description: string
          document_id: string
          id: string
          position: number
          quantity: number
          unit: string
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          document_id: string
          id?: string
          position?: number
          quantity?: number
          unit?: string
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          document_id?: string
          id?: string
          position?: number
          quantity?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          customer_address_line: string
          customer_city: string
          customer_company: string
          customer_country: string
          customer_email: string
          customer_id: string | null
          customer_name: string
          customer_postal_code: string
          customer_vat_id: string
          due_date: string | null
          id: string
          intro_text: string
          issue_date: string
          notes: string
          number: string
          reverse_charge: boolean
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_status"]
          total: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_address_line?: string
          customer_city?: string
          customer_company?: string
          customer_country?: string
          customer_email?: string
          customer_id?: string | null
          customer_name?: string
          customer_postal_code?: string
          customer_vat_id?: string
          due_date?: string | null
          id?: string
          intro_text?: string
          issue_date?: string
          notes?: string
          number: string
          reverse_charge?: boolean
          sent_at?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          total?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_address_line?: string
          customer_city?: string
          customer_company?: string
          customer_country?: string
          customer_email?: string
          customer_id?: string | null
          customer_name?: string
          customer_postal_code?: string
          customer_vat_id?: string
          due_date?: string | null
          id?: string
          intro_text?: string
          issue_date?: string
          notes?: string
          number?: string
          reverse_charge?: boolean
          sent_at?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          total?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      doc_status:
        | "draft"
        | "sent"
        | "paid"
        | "accepted"
        | "declined"
        | "cancelled"
      doc_type: "invoice" | "quote"
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
    Enums: {
      doc_status: [
        "draft",
        "sent",
        "paid",
        "accepted",
        "declined",
        "cancelled",
      ],
      doc_type: ["invoice", "quote"],
    },
  },
} as const
