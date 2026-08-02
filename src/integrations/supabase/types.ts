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
      accountant_access: {
        Row: {
          access_code: string
          active: boolean
          created_at: string
          email: string
          expires_at: string
          id: string
          last_used_at: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_code: string
          active?: boolean
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_code?: string
          active?: boolean
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          email_signature: string
          facebook_url: string
          iban: string
          id: string
          logo_url: string
          owner_name: string
          payment_terms_days: number
          phone: string
          postal_code: string
          smtp_from: string
          smtp_host: string
          smtp_port: number
          smtp_user: string
          tax_number: string
          updated_at: string
          user_id: string
          vat_id: string
          website_url: string
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
          email_signature?: string
          facebook_url?: string
          iban?: string
          id?: string
          logo_url?: string
          owner_name?: string
          payment_terms_days?: number
          phone?: string
          postal_code?: string
          smtp_from?: string
          smtp_host?: string
          smtp_port?: number
          smtp_user?: string
          tax_number?: string
          updated_at?: string
          user_id: string
          vat_id?: string
          website_url?: string
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
          email_signature?: string
          facebook_url?: string
          iban?: string
          id?: string
          logo_url?: string
          owner_name?: string
          payment_terms_days?: number
          phone?: string
          postal_code?: string
          smtp_from?: string
          smtp_host?: string
          smtp_port?: number
          smtp_user?: string
          tax_number?: string
          updated_at?: string
          user_id?: string
          vat_id?: string
          website_url?: string
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
          attachment_text: string
          attachment_title: string
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
          net_total: number
          notes: string
          number: string
          order_number: string
          reverse_charge: boolean
          sent_at: string | null
          service_period: string
          status: Database["public"]["Enums"]["doc_status"]
          tax_mode: string
          total: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          user_id: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          attachment_text?: string
          attachment_title?: string
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
          net_total?: number
          notes?: string
          number: string
          order_number?: string
          reverse_charge?: boolean
          sent_at?: string | null
          service_period?: string
          status?: Database["public"]["Enums"]["doc_status"]
          tax_mode?: string
          total?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          user_id: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          attachment_text?: string
          attachment_title?: string
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
          net_total?: number
          notes?: string
          number?: string
          order_number?: string
          reverse_charge?: boolean
          sent_at?: string | null
          service_period?: string
          status?: Database["public"]["Enums"]["doc_status"]
          tax_mode?: string
          total?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          user_id?: string
          vat_amount?: number
          vat_rate?: number
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
      expenses: {
        Row: {
          category: string
          created_at: string
          document_number: string
          expense_date: string
          gross_amount: number
          id: string
          net_amount: number
          notes: string
          receipt_url: string
          supplier: string
          updated_at: string
          user_id: string
          vat_amount: number
        }
        Insert: {
          category?: string
          created_at?: string
          document_number?: string
          expense_date?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string
          receipt_url?: string
          supplier?: string
          updated_at?: string
          user_id: string
          vat_amount?: number
        }
        Update: {
          category?: string
          created_at?: string
          document_number?: string
          expense_date?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string
          receipt_url?: string
          supplier?: string
          updated_at?: string
          user_id?: string
          vat_amount?: number
        }
        Relationships: []
      }
      recurring_invoices: {
        Row: {
          active: boolean
          created_at: string
          customer_id: string | null
          id: string
          interval_months: number
          next_run: string
          template_document_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          interval_months?: number
          next_run?: string
          template_document_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          interval_months?: number
          next_run?: string
          template_document_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_template_document_id_fkey"
            columns: ["template_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
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
