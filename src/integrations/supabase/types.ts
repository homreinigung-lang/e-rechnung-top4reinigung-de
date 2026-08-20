export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      account_approvals: {
        Row: {
          auth_user_id: string;
          created_at: string;
          decided_at: string | null;
          email: string;
          full_name: string;
          id: string;
          status: string;
          token: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string;
          decided_at?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          status?: string;
          token: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          decided_at?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          status?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      accountant_access: {
        Row: {
          access_code: string;
          active: boolean;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          last_used_at: string | null;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_code: string;
          active?: boolean;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          last_used_at?: string | null;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_code?: string;
          active?: boolean;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          last_used_at?: string | null;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bank_connections: {
        Row: {
          account_ids: string[];
          agreement_id: string;
          created_at: string;
          id: string;
          institution_id: string;
          institution_name: string;
          last_sync_at: string | null;
          provider: string;
          requisition_id: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_ids?: string[];
          agreement_id?: string;
          created_at?: string;
          id?: string;
          institution_id?: string;
          institution_name?: string;
          last_sync_at?: string | null;
          provider?: string;
          requisition_id?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_ids?: string[];
          agreement_id?: string;
          created_at?: string;
          id?: string;
          institution_id?: string;
          institution_name?: string;
          last_sync_at?: string | null;
          provider?: string;
          requisition_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bank_transactions: {
        Row: {
          account_id: string;
          amount: number;
          booking_date: string;
          connection_id: string | null;
          counterparty_name: string;
          created_at: string;
          currency: string;
          external_id: string;
          id: string;
          ignored: boolean;
          match_score: number;
          matched_at: string | null;
          matched_document_id: string | null;
          raw: Json;
          remittance_info: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id?: string;
          amount?: number;
          booking_date: string;
          connection_id?: string | null;
          counterparty_name?: string;
          created_at?: string;
          currency?: string;
          external_id: string;
          id?: string;
          ignored?: boolean;
          match_score?: number;
          matched_at?: string | null;
          matched_document_id?: string | null;
          raw?: Json;
          remittance_info?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          booking_date?: string;
          connection_id?: string | null;
          counterparty_name?: string;
          created_at?: string;
          currency?: string;
          external_id?: string;
          id?: string;
          ignored?: boolean;
          match_score?: number;
          matched_at?: string | null;
          matched_document_id?: string | null;
          raw?: Json;
          remittance_info?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_transactions_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "bank_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_matched_document_id_fkey";
            columns: ["matched_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          sender_auth_user_id: string;
          sender_name: string;
          sender_role: string;
          thread_employee_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          sender_auth_user_id?: string;
          sender_name?: string;
          sender_role?: string;
          thread_employee_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          sender_auth_user_id?: string;
          sender_name?: string;
          sender_role?: string;
          thread_employee_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_employee_id_fkey";
            columns: ["thread_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      company_settings: {
        Row: {
          address_line: string;
          bank_name: string;
          bic: string;
          city: string;
          company_name: string;
          country: string;
          created_at: string;
          email: string;
          email_signature: string;
          email_signature_html: string;
          email_signature_logo_url: string;
          facebook_url: string;
          iban: string;
          id: string;
          logo_url: string;
          owner_name: string;
          payment_terms_days: number;
          phone: string;
          photo_retention_days: number;
          postal_code: string;
          smtp_from: string;
          smtp_host: string;
          smtp_port: number;
          smtp_user: string;
          tax_number: string;
          updated_at: string;
          user_id: string;
          vat_id: string;
          website_url: string;
        };
        Insert: {
          address_line?: string;
          bank_name?: string;
          bic?: string;
          city?: string;
          company_name?: string;
          country?: string;
          created_at?: string;
          email?: string;
          email_signature?: string;
          email_signature_html?: string;
          email_signature_logo_url?: string;
          facebook_url?: string;
          iban?: string;
          id?: string;
          logo_url?: string;
          owner_name?: string;
          payment_terms_days?: number;
          phone?: string;
          photo_retention_days?: number;
          postal_code?: string;
          smtp_from?: string;
          smtp_host?: string;
          smtp_port?: number;
          smtp_user?: string;
          tax_number?: string;
          updated_at?: string;
          user_id: string;
          vat_id?: string;
          website_url?: string;
        };
        Update: {
          address_line?: string;
          bank_name?: string;
          bic?: string;
          city?: string;
          company_name?: string;
          country?: string;
          created_at?: string;
          email?: string;
          email_signature?: string;
          email_signature_html?: string;
          email_signature_logo_url?: string;
          facebook_url?: string;
          iban?: string;
          id?: string;
          logo_url?: string;
          owner_name?: string;
          payment_terms_days?: number;
          phone?: string;
          photo_retention_days?: number;
          postal_code?: string;
          smtp_from?: string;
          smtp_host?: string;
          smtp_port?: number;
          smtp_user?: string;
          tax_number?: string;
          updated_at?: string;
          user_id?: string;
          vat_id?: string;
          website_url?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          address_line: string;
          city: string;
          company: string;
          country: string;
          created_at: string;
          customer_number: string;
          deleted_at: string | null;
          email: string;
          id: string;
          is_eu_customer: boolean;
          name: string;
          notes: string;
          phone: string;
          postal_code: string;
          status: string;
          updated_at: string;
          user_id: string;
          vat_id: string;
        };
        Insert: {
          address_line?: string;
          city?: string;
          company?: string;
          country?: string;
          created_at?: string;
          customer_number?: string;
          deleted_at?: string | null;
          email?: string;
          id?: string;
          is_eu_customer?: boolean;
          name: string;
          notes?: string;
          phone?: string;
          postal_code?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
          vat_id?: string;
        };
        Update: {
          address_line?: string;
          city?: string;
          company?: string;
          country?: string;
          created_at?: string;
          customer_number?: string;
          deleted_at?: string | null;
          email?: string;
          id?: string;
          is_eu_customer?: boolean;
          name?: string;
          notes?: string;
          phone?: string;
          postal_code?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
          vat_id?: string;
        };
        Relationships: [];
      };
      document_audit_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          document_id: string | null;
          document_number: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          document_id?: string | null;
          document_number?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json;
          document_id?: string | null;
          document_number?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      document_items: {
        Row: {
          created_at: string;
          description: string;
          document_id: string;
          id: string;
          is_optional: boolean;
          position: number;
          quantity: number;
          unit: string;
          unit_price: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          document_id: string;
          id?: string;
          is_optional?: boolean;
          position?: number;
          quantity?: number;
          unit?: string;
          unit_price?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          document_id?: string;
          id?: string;
          is_optional?: boolean;
          position?: number;
          quantity?: number;
          unit?: string;
          unit_price?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_items_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          archived_at: string | null;
          attachment_text: string;
          attachment_title: string;
          cancelled_by_document_id: string | null;
          cancels_document_id: string | null;
          converted_document_id: string | null;
          created_at: string;
          customer_address_line: string;
          customer_city: string;
          customer_company: string;
          customer_country: string;
          customer_email: string;
          customer_id: string | null;
          customer_name: string;
          customer_number: string;
          customer_postal_code: string;
          customer_vat_id: string;
          deleted_at: string | null;
          discount_amount: number;
          discount_percent: number;
          discount_reason: string;
          due_date: string | null;
          id: string;
          intro_text: string;
          is_storno: boolean;
          issue_date: string;
          last_reminder_at: string | null;
          locked_at: string | null;
          net_total: number;
          notes: string;
          number: string;
          order_number: string;
          paid_at: string | null;
          pdf_path: string;
          pdf_sha256: string;
          reminder_level: number;
          retention_until: string | null;
          reverse_charge: boolean;
          sent_at: string | null;
          service_description: string;
          service_period: string;
          status: Database["public"]["Enums"]["doc_status"];
          tax_mode: string;
          total: number;
          type: Database["public"]["Enums"]["doc_type"];
          updated_at: string;
          user_id: string;
          vat_amount: number;
          vat_rate: number;
        };
        Insert: {
          archived_at?: string | null;
          attachment_text?: string;
          attachment_title?: string;
          cancelled_by_document_id?: string | null;
          cancels_document_id?: string | null;
          converted_document_id?: string | null;
          created_at?: string;
          customer_address_line?: string;
          customer_city?: string;
          customer_company?: string;
          customer_country?: string;
          customer_email?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_number?: string;
          customer_postal_code?: string;
          customer_vat_id?: string;
          deleted_at?: string | null;
          discount_amount?: number;
          discount_percent?: number;
          discount_reason?: string;
          due_date?: string | null;
          id?: string;
          intro_text?: string;
          is_storno?: boolean;
          issue_date?: string;
          last_reminder_at?: string | null;
          locked_at?: string | null;
          net_total?: number;
          notes?: string;
          number: string;
          order_number?: string;
          paid_at?: string | null;
          pdf_path?: string;
          pdf_sha256?: string;
          reminder_level?: number;
          retention_until?: string | null;
          reverse_charge?: boolean;
          sent_at?: string | null;
          service_description?: string;
          service_period?: string;
          status?: Database["public"]["Enums"]["doc_status"];
          tax_mode?: string;
          total?: number;
          type?: Database["public"]["Enums"]["doc_type"];
          updated_at?: string;
          user_id: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Update: {
          archived_at?: string | null;
          attachment_text?: string;
          attachment_title?: string;
          cancelled_by_document_id?: string | null;
          cancels_document_id?: string | null;
          converted_document_id?: string | null;
          created_at?: string;
          customer_address_line?: string;
          customer_city?: string;
          customer_company?: string;
          customer_country?: string;
          customer_email?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_number?: string;
          customer_postal_code?: string;
          customer_vat_id?: string;
          deleted_at?: string | null;
          discount_amount?: number;
          discount_percent?: number;
          discount_reason?: string;
          due_date?: string | null;
          id?: string;
          intro_text?: string;
          is_storno?: boolean;
          issue_date?: string;
          last_reminder_at?: string | null;
          locked_at?: string | null;
          net_total?: number;
          notes?: string;
          number?: string;
          order_number?: string;
          paid_at?: string | null;
          pdf_path?: string;
          pdf_sha256?: string;
          reminder_level?: number;
          retention_until?: string | null;
          reverse_charge?: boolean;
          sent_at?: string | null;
          service_description?: string;
          service_period?: string;
          status?: Database["public"]["Enums"]["doc_status"];
          tax_mode?: string;
          total?: number;
          type?: Database["public"]["Enums"]["doc_type"];
          updated_at?: string;
          user_id?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "documents_cancelled_by_document_id_fkey";
            columns: ["cancelled_by_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_cancels_document_id_fkey";
            columns: ["cancels_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_converted_document_id_fkey";
            columns: ["converted_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          active: boolean;
          auth_user_id: string | null;
          contract_start: string | null;
          contract_type: string;
          created_at: string;
          email: string;
          hourly_rate: number;
          id: string;
          name: string;
          personnel_number: string;
          phone: string;
          role: string;
          updated_at: string;
          user_id: string;
          weekly_hours: number;
          work_location: string;
        };
        Insert: {
          active?: boolean;
          auth_user_id?: string | null;
          contract_start?: string | null;
          contract_type?: string;
          created_at?: string;
          email?: string;
          hourly_rate?: number;
          id?: string;
          name: string;
          personnel_number?: string;
          phone?: string;
          role?: string;
          updated_at?: string;
          user_id: string;
          weekly_hours?: number;
          work_location?: string;
        };
        Update: {
          active?: boolean;
          auth_user_id?: string | null;
          contract_start?: string | null;
          contract_type?: string;
          created_at?: string;
          email?: string;
          hourly_rate?: number;
          id?: string;
          name?: string;
          personnel_number?: string;
          phone?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
          weekly_hours?: number;
          work_location?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          category: string;
          created_at: string;
          deleted_at: string | null;
          document_number: string;
          expense_date: string;
          gross_amount: number;
          id: string;
          net_amount: number;
          notes: string;
          receipt_url: string;
          supplier: string;
          updated_at: string;
          user_id: string;
          vat_amount: number;
        };
        Insert: {
          category?: string;
          created_at?: string;
          deleted_at?: string | null;
          document_number?: string;
          expense_date?: string;
          gross_amount?: number;
          id?: string;
          net_amount?: number;
          notes?: string;
          receipt_url?: string;
          supplier?: string;
          updated_at?: string;
          user_id: string;
          vat_amount?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          deleted_at?: string | null;
          document_number?: string;
          expense_date?: string;
          gross_amount?: number;
          id?: string;
          net_amount?: number;
          notes?: string;
          receipt_url?: string;
          supplier?: string;
          updated_at?: string;
          user_id?: string;
          vat_amount?: number;
        };
        Relationships: [];
      };
      map_locations: {
        Row: {
          address_line: string;
          city: string;
          country: string;
          created_at: string;
          customer_id: string | null;
          id: string;
          label: string;
          note: string;
          postal_code: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address_line?: string;
          city?: string;
          country?: string;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          label?: string;
          note?: string;
          postal_code?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address_line?: string;
          city?: string;
          country?: string;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          label?: string;
          note?: string;
          postal_code?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "map_locations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      number_sequences: {
        Row: {
          created_at: string;
          kind: string;
          last_value: number;
          updated_at: string;
          user_id: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          kind: string;
          last_value?: number;
          updated_at?: string;
          user_id: string;
          year: number;
        };
        Update: {
          created_at?: string;
          kind?: string;
          last_value?: number;
          updated_at?: string;
          user_id?: string;
          year?: number;
        };
        Relationships: [];
      };
      performance_rates: {
        Row: {
          active: boolean;
          created_at: string;
          floor_covering: string;
          id: string;
          label: string;
          sqm_per_hour: number;
          updated_at: string;
          usage_type: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          floor_covering?: string;
          id?: string;
          label?: string;
          sqm_per_hour?: number;
          updated_at?: string;
          usage_type?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          floor_covering?: string;
          id?: string;
          label?: string;
          sqm_per_hour?: number;
          updated_at?: string;
          usage_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      plan_releases: {
        Row: {
          created_at: string;
          id: string;
          note: string;
          released_at: string;
          updated_at: string;
          user_id: string;
          week_end: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string;
          released_at?: string;
          updated_at?: string;
          user_id: string;
          week_end: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string;
          released_at?: string;
          updated_at?: string;
          user_id?: string;
          week_end?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      project_assignments: {
        Row: {
          assignment_role: string;
          created_at: string;
          day_hours: Json;
          day_times: Json;
          employee_id: string;
          end_date: string | null;
          hours_per_week: number;
          id: string;
          note: string;
          project_id: string;
          start_date: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assignment_role?: string;
          created_at?: string;
          day_hours?: Json;
          day_times?: Json;
          employee_id: string;
          end_date?: string | null;
          hours_per_week?: number;
          id?: string;
          note?: string;
          project_id: string;
          start_date?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          assignment_role?: string;
          created_at?: string;
          day_hours?: Json;
          day_times?: Json;
          employee_id?: string;
          end_date?: string | null;
          hours_per_week?: number;
          id?: string;
          note?: string;
          project_id?: string;
          start_date?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_documents: {
        Row: {
          created_at: string;
          file_name: string;
          file_path: string;
          file_size: number;
          id: string;
          mime_type: string;
          note: string;
          project_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          file_name?: string;
          file_path: string;
          file_size?: number;
          id?: string;
          mime_type?: string;
          note?: string;
          project_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          id?: string;
          mime_type?: string;
          note?: string;
          project_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_lv_items: {
        Row: {
          created_at: string;
          critical: boolean;
          deadline: string | null;
          description: string;
          done: boolean;
          evidence: string;
          id: string;
          position: number;
          project_id: string;
          quantity: number;
          section: string;
          title: string;
          unit: string;
          unit_price: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          critical?: boolean;
          deadline?: string | null;
          description?: string;
          done?: boolean;
          evidence?: string;
          id?: string;
          position?: number;
          project_id: string;
          quantity?: number;
          section?: string;
          title?: string;
          unit?: string;
          unit_price?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          critical?: boolean;
          deadline?: string | null;
          description?: string;
          done?: boolean;
          evidence?: string;
          id?: string;
          position?: number;
          project_id?: string;
          quantity?: number;
          section?: string;
          title?: string;
          unit?: string;
          unit_price?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_lv_items_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_rooms: {
        Row: {
          area_sqm: number;
          confirmed: boolean;
          created_at: string;
          floor: string;
          floor_covering: string;
          frequency: string;
          id: string;
          name: string;
          note: string;
          position: number;
          project_id: string;
          updated_at: string;
          usage_type: string;
          user_id: string;
        };
        Insert: {
          area_sqm?: number;
          confirmed?: boolean;
          created_at?: string;
          floor?: string;
          floor_covering?: string;
          frequency?: string;
          id?: string;
          name?: string;
          note?: string;
          position?: number;
          project_id: string;
          updated_at?: string;
          usage_type?: string;
          user_id: string;
        };
        Update: {
          area_sqm?: number;
          confirmed?: boolean;
          created_at?: string;
          floor?: string;
          floor_covering?: string;
          frequency?: string;
          id?: string;
          name?: string;
          note?: string;
          position?: number;
          project_id?: string;
          updated_at?: string;
          usage_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_rooms_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          address_line: string;
          analysis_highlights: string[];
          analysis_requirements: string[];
          city: string;
          contact_email: string;
          contact_phone: string;
          created_at: string;
          customer_id: string | null;
          customer_name: string;
          executive_summary: string;
          expected_room_count: number;
          hourly_rate: number;
          id: string;
          mode: string;
          name: string;
          notes: string;
          postal_code: string;
          source_file_name: string;
          source_file_path: string;
          sqm_per_hour: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address_line?: string;
          analysis_highlights?: string[];
          analysis_requirements?: string[];
          city?: string;
          contact_email?: string;
          contact_phone?: string;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string;
          executive_summary?: string;
          expected_room_count?: number;
          hourly_rate?: number;
          id?: string;
          mode?: string;
          name?: string;
          notes?: string;
          postal_code?: string;
          source_file_name?: string;
          source_file_path?: string;
          sqm_per_hour?: number;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address_line?: string;
          analysis_highlights?: string[];
          analysis_requirements?: string[];
          city?: string;
          contact_email?: string;
          contact_phone?: string;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string;
          executive_summary?: string;
          expected_room_count?: number;
          hourly_rate?: number;
          id?: string;
          mode?: string;
          name?: string;
          notes?: string;
          postal_code?: string;
          source_file_name?: string;
          source_file_path?: string;
          sqm_per_hour?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_expenses: {
        Row: {
          active: boolean;
          category: string;
          created_at: string;
          gross_amount: number;
          id: string;
          interval_months: number;
          last_run_at: string | null;
          net_amount: number;
          next_run: string;
          notes: string;
          supplier: string;
          title: string;
          updated_at: string;
          user_id: string;
          vat_amount: number;
        };
        Insert: {
          active?: boolean;
          category?: string;
          created_at?: string;
          gross_amount?: number;
          id?: string;
          interval_months?: number;
          last_run_at?: string | null;
          net_amount?: number;
          next_run?: string;
          notes?: string;
          supplier?: string;
          title?: string;
          updated_at?: string;
          user_id: string;
          vat_amount?: number;
        };
        Update: {
          active?: boolean;
          category?: string;
          created_at?: string;
          gross_amount?: number;
          id?: string;
          interval_months?: number;
          last_run_at?: string | null;
          net_amount?: number;
          next_run?: string;
          notes?: string;
          supplier?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          vat_amount?: number;
        };
        Relationships: [];
      };
      recurring_invoices: {
        Row: {
          active: boolean;
          created_at: string;
          customer_id: string | null;
          id: string;
          interval_months: number;
          next_run: string;
          template_document_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          interval_months?: number;
          next_run?: string;
          template_document_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          interval_months?: number;
          next_run?: string;
          template_document_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_invoices_template_document_id_fkey";
            columns: ["template_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      time_account_adjustments: {
        Row: {
          created_at: string;
          employee_id: string;
          entry_date: string;
          hours: number;
          id: string;
          reason: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          entry_date?: string;
          hours?: number;
          id?: string;
          reason?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          entry_date?: string;
          hours?: number;
          id?: string;
          reason?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_account_adjustments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: {
          absence_reason: string;
          approval_status: string;
          billed: boolean;
          break_minutes: number;
          completed_at: string | null;
          created_at: string;
          customer_id: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string;
          employee_id: string | null;
          employee_name: string;
          end_time: string | null;
          entry_type: string;
          hourly_rate: number;
          hours: number;
          id: string;
          location: string;
          note: string;
          photo_paths: string[];
          project_id: string | null;
          start_time: string | null;
          updated_at: string;
          user_id: string;
          work_date: string;
        };
        Insert: {
          absence_reason?: string;
          approval_status?: string;
          billed?: boolean;
          break_minutes?: number;
          completed_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string;
          employee_id?: string | null;
          employee_name?: string;
          end_time?: string | null;
          entry_type?: string;
          hourly_rate?: number;
          hours?: number;
          id?: string;
          location?: string;
          note?: string;
          photo_paths?: string[];
          project_id?: string | null;
          start_time?: string | null;
          updated_at?: string;
          user_id: string;
          work_date?: string;
        };
        Update: {
          absence_reason?: string;
          approval_status?: string;
          billed?: boolean;
          break_minutes?: number;
          completed_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string;
          employee_id?: string | null;
          employee_name?: string;
          end_time?: string | null;
          entry_type?: string;
          hourly_rate?: number;
          hours?: number;
          id?: string;
          location?: string;
          note?: string;
          photo_paths?: string[];
          project_id?: string | null;
          start_time?: string | null;
          updated_at?: string;
          user_id?: string;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_storno: { Args: { _id: string }; Returns: string };
      finalize_document: {
        Args: { _id: string };
        Returns: {
          archived_at: string | null;
          attachment_text: string;
          attachment_title: string;
          cancelled_by_document_id: string | null;
          cancels_document_id: string | null;
          converted_document_id: string | null;
          created_at: string;
          customer_address_line: string;
          customer_city: string;
          customer_company: string;
          customer_country: string;
          customer_email: string;
          customer_id: string | null;
          customer_name: string;
          customer_number: string;
          customer_postal_code: string;
          customer_vat_id: string;
          deleted_at: string | null;
          discount_amount: number;
          discount_percent: number;
          discount_reason: string;
          due_date: string | null;
          id: string;
          intro_text: string;
          is_storno: boolean;
          issue_date: string;
          last_reminder_at: string | null;
          locked_at: string | null;
          net_total: number;
          notes: string;
          number: string;
          order_number: string;
          paid_at: string | null;
          pdf_path: string;
          pdf_sha256: string;
          reminder_level: number;
          retention_until: string | null;
          reverse_charge: boolean;
          sent_at: string | null;
          service_description: string;
          service_period: string;
          status: Database["public"]["Enums"]["doc_status"];
          tax_mode: string;
          total: number;
          type: Database["public"]["Enums"]["doc_type"];
          updated_at: string;
          user_id: string;
          vat_amount: number;
          vat_rate: number;
        };
        SetofOptions: {
          from: "*";
          to: "documents";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      link_employee_account: { Args: never; Returns: string };
      list_trash: {
        Args: never;
        Returns: {
          deleted_at: string;
          entity: string;
          id: string;
          info: string;
          label: string;
        }[];
      };
      my_employee_id: { Args: never; Returns: string };
      my_employee_owner: { Args: never; Returns: string };
      next_customer_number: { Args: never; Returns: string };
      next_document_number: { Args: { _kind: string }; Returns: string };
      owns_document: { Args: { _document_id: string }; Returns: boolean };
      owns_employee_auth_user: {
        Args: { _auth_user_id: string };
        Returns: boolean;
      };
      purge_entity: {
        Args: { _entity: string; _id: string };
        Returns: undefined;
      };
      restore_entity: {
        Args: { _entity: string; _id: string };
        Returns: undefined;
      };
      trash_entity: {
        Args: { _entity: string; _id: string };
        Returns: undefined;
      };
    };
    Enums: {
      doc_status: "draft" | "sent" | "paid" | "accepted" | "declined" | "cancelled";
      doc_type: "invoice" | "quote" | "order";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      doc_status: ["draft", "sent", "paid", "accepted", "declined", "cancelled"],
      doc_type: ["invoice", "quote", "order"],
    },
  },
} as const;
