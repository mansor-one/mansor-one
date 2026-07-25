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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_snapshots: {
        Row: {
          account_id: string | null
          balance: number
          created_at: string | null
          credit_card_id: string | null
          id: string
          notes: string | null
          snapshot_date: string
          source: string | null
        }
        Insert: {
          account_id?: string | null
          balance: number
          created_at?: string | null
          credit_card_id?: string | null
          id?: string
          notes?: string | null
          snapshot_date?: string
          source?: string | null
        }
        Update: {
          account_id?: string | null
          balance?: number
          created_at?: string | null
          credit_card_id?: string | null
          id?: string
          notes?: string | null
          snapshot_date?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_snapshots_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_status: string | null
          account_type: string | null
          archive_reason: string | null
          archived_at: string | null
          balance: number | null
          created_at: string | null
          currency: string | null
          hidden_at: string | null
          household_id: string
          id: string
          is_active: boolean | null
          is_hidden: boolean | null
          is_spendable: boolean | null
          name: string
          owner_id: string | null
          owner_scope: string | null
          replacement_account_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_status?: string | null
          account_type?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          hidden_at?: string | null
          household_id: string
          id?: string
          is_active?: boolean | null
          is_hidden?: boolean | null
          is_spendable?: boolean | null
          name: string
          owner_id?: string | null
          owner_scope?: string | null
          replacement_account_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_status?: string | null
          account_type?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          hidden_at?: string | null
          household_id?: string
          id?: string
          is_active?: boolean | null
          is_hidden?: boolean | null
          is_spendable?: boolean | null
          name?: string
          owner_id?: string | null
          owner_scope?: string | null
          replacement_account_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_replacement_fk"
            columns: ["replacement_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance: {
        Row: {
          asset_id: string | null
          created_at: string | null
          due_date: string | null
          due_mileage: number | null
          estimated_cost: number | null
          frequency_miles: number | null
          frequency_months: number | null
          household_id: string
          id: string
          is_active: boolean | null
          maintenance_type: string | null
          name: string
          notes: string | null
          priority: number | null
          status: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          due_date?: string | null
          due_mileage?: number | null
          estimated_cost?: number | null
          frequency_miles?: number | null
          frequency_months?: number | null
          household_id: string
          id?: string
          is_active?: boolean | null
          maintenance_type?: string | null
          name: string
          notes?: string | null
          priority?: number | null
          status?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          due_date?: string | null
          due_mileage?: number | null
          estimated_cost?: number | null
          frequency_miles?: number | null
          frequency_months?: number | null
          household_id?: string
          id?: string
          is_active?: boolean | null
          maintenance_type?: string | null
          name?: string
          notes?: string | null
          priority?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string
          created_at: string | null
          current_mileage: number | null
          estimated_service_cost: number | null
          estimated_value: number | null
          household_id: string
          id: string
          is_active: boolean | null
          name: string
          next_service_mileage: number | null
          notes: string | null
          owner: string | null
          purchase_date: string | null
          service_frequency_miles: number | null
        }
        Insert: {
          asset_type: string
          created_at?: string | null
          current_mileage?: number | null
          estimated_service_cost?: number | null
          estimated_value?: number | null
          household_id: string
          id?: string
          is_active?: boolean | null
          name: string
          next_service_mileage?: number | null
          notes?: string | null
          owner?: string | null
          purchase_date?: string | null
          service_frequency_miles?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string | null
          current_mileage?: number | null
          estimated_service_cost?: number | null
          estimated_value?: number | null
          household_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          next_service_mileage?: number | null
          notes?: string | null
          owner?: string | null
          purchase_date?: string | null
          service_frequency_miles?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      ath_movil_emails: {
        Row: {
          amount: number | null
          counterparty: string | null
          counterparty_name: string | null
          counterparty_phone: string | null
          created_at: string | null
          direction: string | null
          email_date: string | null
          exclude_from_spending: boolean | null
          from_card: string | null
          gmail_message_id: string
          household_id: string
          id: string
          is_ignored: boolean | null
          is_internal_transfer: boolean | null
          matched_plaid_transaction_id: string | null
          message: string | null
          raw_snippet: string | null
          subject: string | null
          suggested_category: string | null
          to_card: string | null
          transaction_type: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          counterparty?: string | null
          counterparty_name?: string | null
          counterparty_phone?: string | null
          created_at?: string | null
          direction?: string | null
          email_date?: string | null
          exclude_from_spending?: boolean | null
          from_card?: string | null
          gmail_message_id: string
          household_id: string
          id?: string
          is_ignored?: boolean | null
          is_internal_transfer?: boolean | null
          matched_plaid_transaction_id?: string | null
          message?: string | null
          raw_snippet?: string | null
          subject?: string | null
          suggested_category?: string | null
          to_card?: string | null
          transaction_type?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          counterparty?: string | null
          counterparty_name?: string | null
          counterparty_phone?: string | null
          created_at?: string | null
          direction?: string | null
          email_date?: string | null
          exclude_from_spending?: boolean | null
          from_card?: string | null
          gmail_message_id?: string
          household_id?: string
          id?: string
          is_ignored?: boolean | null
          is_internal_transfer?: boolean | null
          matched_plaid_transaction_id?: string | null
          message?: string | null
          raw_snippet?: string | null
          subject?: string | null
          suggested_category?: string | null
          to_card?: string | null
          transaction_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ath_movil_emails_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      ath_movil_matches: {
        Row: {
          ath_email_id: string | null
          confidence: number | null
          created_at: string | null
          id: string
          transaction_id: string | null
        }
        Insert: {
          ath_email_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          transaction_id?: string | null
        }
        Update: {
          ath_email_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          transaction_id?: string | null
        }
        Relationships: []
      }
      ath_movil_messages: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          direction: string | null
          household_id: string
          id: string
          is_reviewed: boolean | null
          matched_plaid_import_id: string | null
          matched_quick_entry_id: string | null
          message: string | null
          notes: string | null
          owner: string | null
          person_name: string | null
          phone_or_email: string | null
          source_email_id: string | null
          transaction_date: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          direction?: string | null
          household_id: string
          id?: string
          is_reviewed?: boolean | null
          matched_plaid_import_id?: string | null
          matched_quick_entry_id?: string | null
          message?: string | null
          notes?: string | null
          owner?: string | null
          person_name?: string | null
          phone_or_email?: string | null
          source_email_id?: string | null
          transaction_date?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          direction?: string | null
          household_id?: string
          id?: string
          is_reviewed?: boolean | null
          matched_plaid_import_id?: string | null
          matched_quick_entry_id?: string | null
          message?: string | null
          notes?: string | null
          owner?: string | null
          person_name?: string | null
          phone_or_email?: string | null
          source_email_id?: string | null
          transaction_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ath_movil_messages_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ath_movil_messages_matched_plaid_import_id_fkey"
            columns: ["matched_plaid_import_id"]
            isOneToOne: false
            referencedRelation: "plaid_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ath_movil_messages_matched_quick_entry_id_fkey"
            columns: ["matched_quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ath_movil_rules: {
        Row: {
          active: boolean | null
          category: string | null
          id: string
          keyword: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          id?: string
          keyword?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          id?: string
          keyword?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_type: string | null
          created_at: string | null
          id: string
          name: string
          parent_category: string | null
        }
        Insert: {
          category_type?: string | null
          created_at?: string | null
          id?: string
          name: string
          parent_category?: string | null
        }
        Update: {
          category_type?: string | null
          created_at?: string | null
          id?: string
          name?: string
          parent_category?: string | null
        }
        Relationships: []
      }
      confirmed_ledger_duplicate_resolutions: {
        Row: {
          duplicate_quick_entry_id: string
          fingerprint: string
          household_id: string
          id: string
          metadata: Json
          reason: string
          resolution_type: string
          resolved_at: string
          resolved_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_connection_ids: string[]
          status: string
          survivor_quick_entry_id: string
          user_id: string
        }
        Insert: {
          duplicate_quick_entry_id: string
          fingerprint: string
          household_id: string
          id?: string
          metadata?: Json
          reason: string
          resolution_type: string
          resolved_at?: string
          resolved_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_connection_ids?: string[]
          status?: string
          survivor_quick_entry_id: string
          user_id: string
        }
        Update: {
          duplicate_quick_entry_id?: string
          fingerprint?: string
          household_id?: string
          id?: string
          metadata?: Json
          reason?: string
          resolution_type?: string
          resolved_at?: string
          resolved_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_connection_ids?: string[]
          status?: string
          survivor_quick_entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confirmed_ledger_duplicate_resolu_duplicate_quick_entry_id_fkey"
            columns: ["duplicate_quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmed_ledger_duplicate_resolut_survivor_quick_entry_id_fkey"
            columns: ["survivor_quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmed_ledger_duplicate_resolutions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          autopay_account_label: string | null
          autopay_enabled: boolean | null
          balance: number | null
          bank: string | null
          card_type: string | null
          created_at: string | null
          credit_limit: number | null
          cutoff_day: number | null
          due_day: number | null
          household_id: string
          id: string
          interest_notes: string | null
          is_active: boolean | null
          manual_last4: string | null
          minimum_payment: number | null
          name: string
          owner_id: string | null
          payment_account_notes: string | null
          plaid_account_id: string | null
          promo_apr: number | null
          promo_end_date: string | null
          regular_apr: number | null
          scheduled_payment_id: string | null
          use_case: string | null
          user_id: string | null
        }
        Insert: {
          autopay_account_label?: string | null
          autopay_enabled?: boolean | null
          balance?: number | null
          bank?: string | null
          card_type?: string | null
          created_at?: string | null
          credit_limit?: number | null
          cutoff_day?: number | null
          due_day?: number | null
          household_id: string
          id?: string
          interest_notes?: string | null
          is_active?: boolean | null
          manual_last4?: string | null
          minimum_payment?: number | null
          name: string
          owner_id?: string | null
          payment_account_notes?: string | null
          plaid_account_id?: string | null
          promo_apr?: number | null
          promo_end_date?: string | null
          regular_apr?: number | null
          scheduled_payment_id?: string | null
          use_case?: string | null
          user_id?: string | null
        }
        Update: {
          autopay_account_label?: string | null
          autopay_enabled?: boolean | null
          balance?: number | null
          bank?: string | null
          card_type?: string | null
          created_at?: string | null
          credit_limit?: number | null
          cutoff_day?: number | null
          due_day?: number | null
          household_id?: string
          id?: string
          interest_notes?: string | null
          is_active?: boolean | null
          manual_last4?: string | null
          minimum_payment?: number | null
          name?: string
          owner_id?: string | null
          payment_account_notes?: string | null
          plaid_account_id?: string | null
          promo_apr?: number | null
          promo_end_date?: string | null
          regular_apr?: number | null
          scheduled_payment_id?: string | null
          use_case?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_cards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_cards_plaid_account_id_fkey"
            columns: ["plaid_account_id"]
            isOneToOne: false
            referencedRelation: "plaid_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_cards_scheduled_payment_id_fkey"
            columns: ["scheduled_payment_id"]
            isOneToOne: false
            referencedRelation: "scheduled_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          current_saved: number | null
          estimated_cost: number | null
          event_date: string | null
          id: string
          name: string
          notes: string | null
          related_person_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          current_saved?: number | null
          estimated_cost?: number | null
          event_date?: string | null
          id?: string
          name: string
          notes?: string | null
          related_person_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          current_saved?: number | null
          estimated_cost?: number | null
          event_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          related_person_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_goals: {
        Row: {
          asset_id: string | null
          created_at: string | null
          current_amount: number | null
          goal_type: string
          household_id: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          priority: number | null
          target_amount: number
          target_date: string | null
          user_id: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          current_amount?: number | null
          goal_type: string
          household_id: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          priority?: number | null
          target_amount: number
          target_date?: string | null
          user_id?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          current_amount?: number | null
          goal_type?: string
          household_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          priority?: number | null
          target_amount?: number
          target_date?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_goals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_links: {
        Row: {
          confidence: number | null
          created_at: string | null
          household_id: string
          id: string
          link_type: string
          notes: string | null
          source_id: string
          source_table: string
          status: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          household_id: string
          id?: string
          link_type: string
          notes?: string | null
          source_id: string
          source_table: string
          status?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          household_id?: string
          id?: string
          link_type?: string
          notes?: string | null
          source_id?: string
          source_table?: string
          status?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_links_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_expenses: {
        Row: {
          amount: number | null
          category_id: string | null
          created_at: string | null
          due_day: number | null
          frequency: string | null
          id: string
          is_active: boolean | null
          name: string
          responsible_id: string | null
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          due_day?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          responsible_id?: string | null
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          due_day?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          responsible_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_expenses_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          created_at: string | null
          current_amount: number | null
          goal_amount: number | null
          household_id: string
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          target_date: string | null
        }
        Insert: {
          created_at?: string | null
          current_amount?: number | null
          goal_amount?: number | null
          household_id: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          target_date?: string | null
        }
        Update: {
          created_at?: string | null
          current_amount?: number | null
          goal_amount?: number | null
          household_id?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      future_obligations: {
        Row: {
          category: string | null
          created_at: string | null
          estimated_amount: number | null
          household_id: string
          id: string
          monthly_reserve: number | null
          name: string
          notes: string | null
          priority: string | null
          status: string | null
          target_date: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          estimated_amount?: number | null
          household_id: string
          id?: string
          monthly_reserve?: number | null
          name: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          target_date?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          estimated_amount?: number | null
          household_id?: string
          id?: string
          monthly_reserve?: number | null
          name?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "future_obligations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          category: string | null
          created_at: string | null
          current_amount: number | null
          household_id: string
          id: string
          name: string
          notes: string | null
          priority: string | null
          target_amount: number | null
          target_date: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_amount?: number | null
          household_id: string
          id?: string
          name: string
          notes?: string | null
          priority?: string | null
          target_amount?: number | null
          target_date?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_amount?: number | null
          household_id?: string
          id?: string
          name?: string
          notes?: string | null
          priority?: string | null
          target_amount?: number | null
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          created_at: string | null
          household_id: string
          id: string
          name: string
          role: string
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          created_at?: string | null
          household_id: string
          id?: string
          name: string
          role?: string
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          created_at?: string | null
          household_id?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      income_schedule: {
        Row: {
          amount: number | null
          amount_is_estimated: boolean
          cadence: string
          category_code: string | null
          confidence: string | null
          created_at: string | null
          destination_account: string | null
          destination_account_id: string | null
          destination_account_source: string | null
          frequency: string | null
          household_id: string
          id: string
          income_type: string
          is_active: boolean | null
          is_fixed: boolean | null
          last_received_date: string | null
          name: string
          next_expected_date: string | null
          notes: string | null
          owner: string | null
          owner_scope: string
          received_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          amount_is_estimated?: boolean
          cadence?: string
          category_code?: string | null
          confidence?: string | null
          created_at?: string | null
          destination_account?: string | null
          destination_account_id?: string | null
          destination_account_source?: string | null
          frequency?: string | null
          household_id: string
          id?: string
          income_type?: string
          is_active?: boolean | null
          is_fixed?: boolean | null
          last_received_date?: string | null
          name: string
          next_expected_date?: string | null
          notes?: string | null
          owner?: string | null
          owner_scope?: string
          received_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          amount_is_estimated?: boolean
          cadence?: string
          category_code?: string | null
          confidence?: string | null
          created_at?: string | null
          destination_account?: string | null
          destination_account_id?: string | null
          destination_account_source?: string | null
          frequency?: string | null
          household_id?: string
          id?: string
          income_type?: string
          is_active?: boolean | null
          is_fixed?: boolean | null
          last_received_date?: string | null
          name?: string
          next_expected_date?: string | null
          notes?: string | null
          owner?: string | null
          owner_scope?: string
          received_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_schedule_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          apr: number | null
          balance: number | null
          created_at: string | null
          due_day: number | null
          grace_day: number | null
          household_id: string
          id: string
          is_active: boolean | null
          lender: string | null
          liability_type: string
          monthly_payment: number | null
          name: string
          notes: string | null
          owner: string | null
          payments_made: number | null
          principal_paid: number | null
          related_asset_id: string | null
          remaining_payments: number | null
          total_payments: number | null
        }
        Insert: {
          apr?: number | null
          balance?: number | null
          created_at?: string | null
          due_day?: number | null
          grace_day?: number | null
          household_id: string
          id?: string
          is_active?: boolean | null
          lender?: string | null
          liability_type: string
          monthly_payment?: number | null
          name: string
          notes?: string | null
          owner?: string | null
          payments_made?: number | null
          principal_paid?: number | null
          related_asset_id?: string | null
          remaining_payments?: number | null
          total_payments?: number | null
        }
        Update: {
          apr?: number | null
          balance?: number | null
          created_at?: string | null
          due_day?: number | null
          grace_day?: number | null
          household_id?: string
          id?: string
          is_active?: boolean | null
          lender?: string | null
          liability_type?: string
          monthly_payment?: number | null
          name?: string
          notes?: string | null
          owner?: string | null
          payments_made?: number | null
          principal_paid?: number | null
          related_asset_id?: string | null
          remaining_payments?: number | null
          total_payments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liabilities_related_asset_id_fkey"
            columns: ["related_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_rules: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          default_transaction_type: string | null
          household_id: string
          id: string
          merchant_keyword: string
          notes: string | null
          suggested_category: string | null
          suggested_category_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          default_transaction_type?: string | null
          household_id: string
          id?: string
          merchant_keyword: string
          notes?: string | null
          suggested_category?: string | null
          suggested_category_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          default_transaction_type?: string | null
          household_id?: string
          id?: string
          merchant_keyword?: string
          notes?: string | null
          suggested_category?: string | null
          suggested_category_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_rules_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_documents: {
        Row: {
          document_type: string | null
          id: string
          notes: string | null
          person: string | null
          statement_month: string | null
          uploaded: boolean | null
          uploaded_at: string | null
        }
        Insert: {
          document_type?: string | null
          id?: string
          notes?: string | null
          person?: string | null
          statement_month?: string | null
          uploaded?: boolean | null
          uploaded_at?: string | null
        }
        Update: {
          document_type?: string | null
          id?: string
          notes?: string | null
          person?: string | null
          statement_month?: string | null
          uploaded?: boolean | null
          uploaded_at?: string | null
        }
        Relationships: []
      }
      obligation_instances: {
        Row: {
          amount_expected: number | null
          amount_is_estimated: boolean
          created_at: string
          effective_due_date: string
          expected_date: string
          household_id: string
          id: string
          notes: string | null
          obligation_id: string
          provider_id: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_expected?: number | null
          amount_is_estimated?: boolean
          created_at?: string
          effective_due_date: string
          expected_date: string
          household_id: string
          id?: string
          notes?: string | null
          obligation_id: string
          provider_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_expected?: number | null
          amount_is_estimated?: boolean
          created_at?: string
          effective_due_date?: string
          expected_date?: string
          household_id?: string
          id?: string
          notes?: string | null
          obligation_id?: string
          provider_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligation_instances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_instances_obligation_user_fk"
            columns: ["obligation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "obligation_instances_provider_user_fk"
            columns: ["provider_id", "user_id"]
            isOneToOne: false
            referencedRelation: "obligation_providers"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      obligation_payment_links: {
        Row: {
          confidence: number | null
          confirmation_note: string | null
          confirmed_at: string | null
          created_at: string
          household_id: string
          id: string
          link_source: string
          linked_at: string
          notes: string | null
          obligation_instance_id: string
          payment_account_id: string | null
          payment_account_source: string | null
          payment_method: string | null
          plaid_import_id: string | null
          quick_entry_id: string | null
          reconciled_at: string | null
          reconciliation_status: string
          score_factors: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          confirmation_note?: string | null
          confirmed_at?: string | null
          created_at?: string
          household_id: string
          id?: string
          link_source?: string
          linked_at?: string
          notes?: string | null
          obligation_instance_id: string
          payment_account_id?: string | null
          payment_account_source?: string | null
          payment_method?: string | null
          plaid_import_id?: string | null
          quick_entry_id?: string | null
          reconciled_at?: string | null
          reconciliation_status?: string
          score_factors?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          confirmation_note?: string | null
          confirmed_at?: string | null
          created_at?: string
          household_id?: string
          id?: string
          link_source?: string
          linked_at?: string
          notes?: string | null
          obligation_instance_id?: string
          payment_account_id?: string | null
          payment_account_source?: string | null
          payment_method?: string | null
          plaid_import_id?: string | null
          quick_entry_id?: string | null
          reconciled_at?: string | null
          reconciliation_status?: string
          score_factors?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligation_payment_links_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_links_instance_user_fk"
            columns: ["obligation_instance_id", "user_id"]
            isOneToOne: false
            referencedRelation: "obligation_instances"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "obligation_payment_links_plaid_import_fk"
            columns: ["plaid_import_id"]
            isOneToOne: false
            referencedRelation: "plaid_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_links_quick_entry_fk"
            columns: ["quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      obligation_providers: {
        Row: {
          active_from: string | null
          active_until: string | null
          created_at: string
          household_id: string
          id: string
          notes: string | null
          obligation_id: string
          payment_method: string | null
          phone: string | null
          provider_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          household_id: string
          id?: string
          notes?: string | null
          obligation_id: string
          payment_method?: string | null
          phone?: string | null
          provider_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          household_id?: string
          id?: string
          notes?: string | null
          obligation_id?: string
          payment_method?: string | null
          phone?: string | null
          provider_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligation_providers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_providers_obligation_user_fk"
            columns: ["obligation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      obligation_reconciliation_events: {
        Row: {
          confidence: number | null
          event_type: string
          evidence: Json
          from_status: string | null
          household_id: string
          id: string
          obligation_instance_id: string
          occurred_at: string
          payment_link_id: string | null
          to_status: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          event_type: string
          evidence?: Json
          from_status?: string | null
          household_id: string
          id?: string
          obligation_instance_id: string
          occurred_at?: string
          payment_link_id?: string | null
          to_status: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          event_type?: string
          evidence?: Json
          from_status?: string | null
          household_id?: string
          id?: string
          obligation_instance_id?: string
          occurred_at?: string
          payment_link_id?: string | null
          to_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligation_reconciliation_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_reconciliation_events_instance_user_fk"
            columns: ["obligation_instance_id", "user_id"]
            isOneToOne: false
            referencedRelation: "obligation_instances"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "obligation_reconciliation_events_link_fk"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "obligation_payment_links"
            referencedColumns: ["id"]
          },
        ]
      }
      obligations: {
        Row: {
          active: boolean | null
          amount: number | null
          amount_is_estimated: boolean
          category_code: string | null
          created_at: string | null
          default_amount: number | null
          description: string | null
          due_date: string | null
          due_day: number | null
          frequency: string
          grace_period_days: number
          household_id: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          obligation_type: string
          owner: string
          payment_method: string | null
          person: string
          priority: number | null
          recurrence: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          amount?: number | null
          amount_is_estimated?: boolean
          category_code?: string | null
          created_at?: string | null
          default_amount?: number | null
          description?: string | null
          due_date?: string | null
          due_day?: number | null
          frequency?: string
          grace_period_days?: number
          household_id: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          obligation_type?: string
          owner?: string
          payment_method?: string | null
          person: string
          priority?: number | null
          recurrence?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          amount?: number | null
          amount_is_estimated?: boolean
          category_code?: string | null
          created_at?: string | null
          default_amount?: number | null
          description?: string | null
          due_date?: string | null
          due_day?: number | null
          frequency?: string
          grace_period_days?: number
          household_id?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          obligation_type?: string
          owner?: string
          payment_method?: string | null
          person?: string
          priority?: number | null
          recurrence?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obligations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      pablo_questions: {
        Row: {
          answer: string | null
          created_at: string | null
          id: string
          question: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          id?: string
          question: string
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_instances: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          effective_due_date: string | null
          household_id: string
          id: string
          name: string
          notes: string | null
          original_due_day: number | null
          owner: string | null
          payment_month: number
          payment_year: number
          scheduled_payment_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          effective_due_date?: string | null
          household_id: string
          id?: string
          name: string
          notes?: string | null
          original_due_day?: number | null
          owner?: string | null
          payment_month: number
          payment_year: number
          scheduled_payment_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          effective_due_date?: string | null
          household_id?: string
          id?: string
          name?: string
          notes?: string | null
          original_due_day?: number | null
          owner?: string | null
          payment_month?: number
          payment_year?: number
          scheduled_payment_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_instances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_instances_scheduled_payment_id_fkey"
            columns: ["scheduled_payment_id"]
            isOneToOne: false
            referencedRelation: "scheduled_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string | null
          household_id: string
          id: string
          name: string
          relationship: string | null
        }
        Insert: {
          created_at?: string | null
          household_id: string
          id?: string
          name: string
          relationship?: string | null
        }
        Update: {
          created_at?: string | null
          household_id?: string
          id?: string
          name?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_accounts: {
        Row: {
          account_status: string | null
          archive_reason: string | null
          archived_at: string | null
          available_balance: number | null
          connection_id: string | null
          currency: string | null
          current_balance: number | null
          display_name: string | null
          hidden_at: string | null
          household_id: string
          id: string
          include_in_dashboard: boolean | null
          institution_name: string | null
          is_hidden: boolean | null
          is_spendable: boolean
          name: string | null
          owner_scope: string | null
          plaid_account_id: string | null
          plaid_last_statement_balance: number | null
          plaid_liability_is_overdue: boolean | null
          plaid_liability_updated_at: string | null
          plaid_minimum_payment_amount: number | null
          plaid_next_payment_due_date: string | null
          portfolio_updated_at: string | null
          subtype: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_status?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          available_balance?: number | null
          connection_id?: string | null
          currency?: string | null
          current_balance?: number | null
          display_name?: string | null
          hidden_at?: string | null
          household_id: string
          id?: string
          include_in_dashboard?: boolean | null
          institution_name?: string | null
          is_hidden?: boolean | null
          is_spendable?: boolean
          name?: string | null
          owner_scope?: string | null
          plaid_account_id?: string | null
          plaid_last_statement_balance?: number | null
          plaid_liability_is_overdue?: boolean | null
          plaid_liability_updated_at?: string | null
          plaid_minimum_payment_amount?: number | null
          plaid_next_payment_due_date?: string | null
          portfolio_updated_at?: string | null
          subtype?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_status?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          available_balance?: number | null
          connection_id?: string | null
          currency?: string | null
          current_balance?: number | null
          display_name?: string | null
          hidden_at?: string | null
          household_id?: string
          id?: string
          include_in_dashboard?: boolean | null
          institution_name?: string | null
          is_hidden?: boolean | null
          is_spendable?: boolean
          name?: string | null
          owner_scope?: string | null
          plaid_account_id?: string | null
          plaid_last_statement_balance?: number | null
          plaid_liability_is_overdue?: boolean | null
          plaid_liability_updated_at?: string | null
          plaid_minimum_payment_amount?: number | null
          plaid_next_payment_due_date?: string | null
          portfolio_updated_at?: string | null
          subtype?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaid_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_category_rules: {
        Row: {
          created_at: string | null
          id: string
          plaid_detailed: string | null
          plaid_primary: string
          suggested_category: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plaid_detailed?: string | null
          plaid_primary: string
          suggested_category: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plaid_detailed?: string | null
          plaid_primary?: string
          suggested_category?: string
        }
        Relationships: []
      }
      plaid_connections: {
        Row: {
          access_token: string | null
          archive_reason: string | null
          archived_at: string | null
          created_at: string | null
          disconnected_at: string | null
          encrypted_access_token: string | null
          household_id: string
          id: string
          institution_name: string | null
          item_id: string | null
          last_repair_success_at: string | null
          last_sync_attempt_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          status: string | null
          status_updated_at: string | null
          token_auth_tag: string | null
          token_iv: string | null
          transactions_cursor: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          created_at?: string | null
          disconnected_at?: string | null
          encrypted_access_token?: string | null
          household_id: string
          id?: string
          institution_name?: string | null
          item_id?: string | null
          last_repair_success_at?: string | null
          last_sync_attempt_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          status?: string | null
          status_updated_at?: string | null
          token_auth_tag?: string | null
          token_iv?: string | null
          transactions_cursor?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          created_at?: string | null
          disconnected_at?: string | null
          encrypted_access_token?: string | null
          household_id?: string
          id?: string
          institution_name?: string | null
          item_id?: string | null
          last_repair_success_at?: string | null
          last_sync_attempt_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          status?: string | null
          status_updated_at?: string | null
          token_auth_tag?: string | null
          token_iv?: string | null
          transactions_cursor?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaid_connections_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_imports: {
        Row: {
          account_mask: string | null
          account_name: string | null
          account_subtype: string | null
          account_type: string | null
          amount: number | null
          created_at: string | null
          household_id: string
          id: string
          imported: boolean | null
          institution_name: string | null
          merchant: string | null
          pending: boolean
          pending_transaction_id: string | null
          plaid_account_id: string | null
          plaid_category: string | null
          plaid_transaction_id: string | null
          removed_at: string | null
          suggested_category: string | null
          superseded_at: string | null
          superseded_by_transaction_id: string | null
          transaction_date: string | null
          transaction_status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          amount?: number | null
          created_at?: string | null
          household_id: string
          id?: string
          imported?: boolean | null
          institution_name?: string | null
          merchant?: string | null
          pending?: boolean
          pending_transaction_id?: string | null
          plaid_account_id?: string | null
          plaid_category?: string | null
          plaid_transaction_id?: string | null
          removed_at?: string | null
          suggested_category?: string | null
          superseded_at?: string | null
          superseded_by_transaction_id?: string | null
          transaction_date?: string | null
          transaction_status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          amount?: number | null
          created_at?: string | null
          household_id?: string
          id?: string
          imported?: boolean | null
          institution_name?: string | null
          merchant?: string | null
          pending?: boolean
          pending_transaction_id?: string | null
          plaid_account_id?: string | null
          plaid_category?: string | null
          plaid_transaction_id?: string | null
          removed_at?: string | null
          suggested_category?: string | null
          superseded_at?: string | null
          superseded_by_transaction_id?: string | null
          transaction_date?: string | null
          transaction_status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaid_imports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string | null
          created_at: string | null
          id: string
          institution_name: string | null
          item_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          id?: string
          institution_name?: string | null
          item_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          id?: string
          institution_name?: string | null
          item_id?: string | null
        }
        Relationships: []
      }
      plaid_sync_runs: {
        Row: {
          completed_at: string | null
          completed_steps: number
          created_at: string
          current_step: string | null
          daily_window_key: string | null
          duration_ms: number | null
          error_message: string | null
          household_id: string
          id: string
          last_heartbeat_at: string | null
          lock_expires_at: string | null
          percentage: number
          retry_of_run_id: string | null
          retryable_step: string | null
          started_at: string | null
          status: string
          step_results: Json
          summary: Json
          total_steps: number
          trigger: string
          updated_at: string
          user_id: string
          warnings: Json
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: number
          created_at?: string
          current_step?: string | null
          daily_window_key?: string | null
          duration_ms?: number | null
          error_message?: string | null
          household_id: string
          id?: string
          last_heartbeat_at?: string | null
          lock_expires_at?: string | null
          percentage?: number
          retry_of_run_id?: string | null
          retryable_step?: string | null
          started_at?: string | null
          status?: string
          step_results?: Json
          summary?: Json
          total_steps?: number
          trigger?: string
          updated_at?: string
          user_id: string
          warnings?: Json
        }
        Update: {
          completed_at?: string | null
          completed_steps?: number
          created_at?: string
          current_step?: string | null
          daily_window_key?: string | null
          duration_ms?: number | null
          error_message?: string | null
          household_id?: string
          id?: string
          last_heartbeat_at?: string | null
          lock_expires_at?: string | null
          percentage?: number
          retry_of_run_id?: string | null
          retryable_step?: string | null
          started_at?: string | null
          status?: string
          step_results?: Json
          summary?: Json
          total_steps?: number
          trigger?: string
          updated_at?: string
          user_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "plaid_sync_runs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_sync_runs_retry_of_run_id_fkey"
            columns: ["retry_of_run_id"]
            isOneToOne: false
            referencedRelation: "plaid_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_item_transactions: {
        Row: {
          amount: number
          canonical_category: string | null
          created_at: string | null
          from_item_id: string | null
          household_id: string
          household_owner: string | null
          id: string
          notes: string | null
          plaid_import_id: string | null
          planning_item_id: string | null
          quick_entry_id: string | null
          to_item_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          canonical_category?: string | null
          created_at?: string | null
          from_item_id?: string | null
          household_id: string
          household_owner?: string | null
          id?: string
          notes?: string | null
          plaid_import_id?: string | null
          planning_item_id?: string | null
          quick_entry_id?: string | null
          to_item_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          canonical_category?: string | null
          created_at?: string | null
          from_item_id?: string | null
          household_id?: string
          household_owner?: string | null
          id?: string
          notes?: string | null
          plaid_import_id?: string | null
          planning_item_id?: string | null
          quick_entry_id?: string | null
          to_item_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_item_transactions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "planning_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_transactions_plaid_import_id_fkey"
            columns: ["plaid_import_id"]
            isOneToOne: false
            referencedRelation: "plaid_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_transactions_planning_item_id_fkey"
            columns: ["planning_item_id"]
            isOneToOne: false
            referencedRelation: "planning_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_transactions_quick_entry_id_fkey"
            columns: ["quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_transactions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "planning_items"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_items: {
        Row: {
          category: string | null
          created_at: string | null
          current_amount: number | null
          due_date: string | null
          household_id: string
          id: string
          is_archived: boolean | null
          is_completed: boolean | null
          item_type: string
          legacy_id: string | null
          legacy_source: string | null
          name: string
          notes: string | null
          owner: string | null
          priority_level: string
          spent_amount: number
          status: string
          target_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_amount?: number | null
          due_date?: string | null
          household_id: string
          id?: string
          is_archived?: boolean | null
          is_completed?: boolean | null
          item_type: string
          legacy_id?: string | null
          legacy_source?: string | null
          name: string
          notes?: string | null
          owner?: string | null
          priority_level?: string
          spent_amount?: number
          status?: string
          target_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_amount?: number | null
          due_date?: string | null
          household_id?: string
          id?: string
          is_archived?: boolean | null
          is_completed?: boolean | null
          item_type?: string
          legacy_id?: string | null
          legacy_source?: string | null
          name?: string
          notes?: string | null
          owner?: string | null
          priority_level?: string
          spent_amount?: number
          status?: string
          target_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      priorities: {
        Row: {
          amount: number | null
          created_at: string | null
          due_date: string | null
          household_id: string
          id: string
          name: string
          notes: string | null
          owner: string | null
          priority_level: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          due_date?: string | null
          household_id: string
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          priority_level?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          due_date?: string | null
          household_id?: string
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          priority_level?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "priorities_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_entries: {
        Row: {
          account_id: string | null
          account_name: string | null
          amount: number
          category: string | null
          created_at: string | null
          description: string
          entry_date: string
          entry_type: string
          household_id: string
          id: string
          notes: string | null
          owner: string | null
          plaid_transaction_id: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          amount: number
          category?: string | null
          created_at?: string | null
          description: string
          entry_date?: string
          entry_type: string
          household_id: string
          id?: string
          notes?: string | null
          owner?: string | null
          plaid_transaction_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          amount?: number
          category?: string | null
          created_at?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          household_id?: string
          id?: string
          notes?: string | null
          owner?: string | null
          plaid_transaction_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_transactions: {
        Row: {
          account_id: string | null
          confidence_score: number | null
          created_at: string | null
          credit_card_id: string | null
          final_category_id: string | null
          id: string
          needs_review: boolean | null
          normalized_description: string | null
          raw_amount: number
          raw_description: string
          statement_import_id: string | null
          suggested_category: string | null
          transaction_date: string | null
          transaction_direction: string | null
        }
        Insert: {
          account_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          credit_card_id?: string | null
          final_category_id?: string | null
          id?: string
          needs_review?: boolean | null
          normalized_description?: string | null
          raw_amount: number
          raw_description: string
          statement_import_id?: string | null
          suggested_category?: string | null
          transaction_date?: string | null
          transaction_direction?: string | null
        }
        Update: {
          account_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          credit_card_id?: string | null
          final_category_id?: string | null
          id?: string
          needs_review?: boolean | null
          normalized_description?: string | null
          raw_amount?: number
          raw_description?: string
          statement_import_id?: string | null
          suggested_category?: string | null
          transaction_date?: string | null
          transaction_direction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_transactions_final_category_id_fkey"
            columns: ["final_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_transactions_statement_import_id_fkey"
            columns: ["statement_import_id"]
            isOneToOne: false
            referencedRelation: "statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          created_at: string | null
          id: string
          priority: string | null
          recommendation: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          priority?: string | null
          recommendation?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          priority?: string | null
          recommendation?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          related_id: string | null
          related_table: string | null
          reminder_date: string
          reminder_type: string | null
          title: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          related_id?: string | null
          related_table?: string | null
          reminder_date: string
          reminder_type?: string | null
          title: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          related_id?: string | null
          related_table?: string | null
          reminder_date?: string
          reminder_type?: string | null
          title?: string
        }
        Relationships: []
      }
      review_queue_resolution_events: {
        Row: {
          candidate_snapshot: Json
          created_at: string
          duplicate_quick_entry_id: string | null
          event_type: string
          household_id: string
          id: string
          match_confidence: number | null
          match_type: string | null
          plaid_import_id: string
          quick_entry_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          candidate_snapshot?: Json
          created_at?: string
          duplicate_quick_entry_id?: string | null
          event_type: string
          household_id: string
          id?: string
          match_confidence?: number | null
          match_type?: string | null
          plaid_import_id: string
          quick_entry_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          candidate_snapshot?: Json
          created_at?: string
          duplicate_quick_entry_id?: string | null
          event_type?: string
          household_id?: string
          id?: string
          match_confidence?: number | null
          match_type?: string | null
          plaid_import_id?: string
          quick_entry_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_resolution_events_duplicate_quick_entry_id_fkey"
            columns: ["duplicate_quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_queue_resolution_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_queue_resolution_events_plaid_import_id_fkey"
            columns: ["plaid_import_id"]
            isOneToOne: false
            referencedRelation: "plaid_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_queue_resolution_events_quick_entry_id_fkey"
            columns: ["quick_entry_id"]
            isOneToOne: false
            referencedRelation: "quick_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_payments: {
        Row: {
          active_months: string | null
          amount: number | null
          category: string | null
          created_at: string | null
          credit_card_id: string | null
          custom_schedule_notes: string | null
          due_day: number | null
          grace_day: number | null
          household_id: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          owner: string | null
          recurrence_interval: number | null
          recurrence_type: string | null
          user_id: string | null
        }
        Insert: {
          active_months?: string | null
          amount?: number | null
          category?: string | null
          created_at?: string | null
          credit_card_id?: string | null
          custom_schedule_notes?: string | null
          due_day?: number | null
          grace_day?: number | null
          household_id: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          owner?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          user_id?: string | null
        }
        Update: {
          active_months?: string | null
          amount?: number | null
          category?: string | null
          created_at?: string | null
          credit_card_id?: string | null
          custom_schedule_notes?: string | null
          due_day?: number | null
          grace_day?: number | null
          household_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          owner?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_payments_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_payments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_imports: {
        Row: {
          created_at: string | null
          file_name: string | null
          id: string
          imported_by: string | null
          notes: string | null
          source_name: string
          source_type: string | null
          statement_period_end: string | null
          statement_period_start: string | null
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          imported_by?: string | null
          notes?: string | null
          source_name: string
          source_type?: string | null
          statement_period_end?: string | null
          statement_period_start?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          imported_by?: string | null
          notes?: string | null
          source_name?: string
          source_type?: string | null
          statement_period_end?: string | null
          statement_period_start?: string | null
        }
        Relationships: []
      }
      transaction_enrichments: {
        Row: {
          confidence_score: number | null
          created_at: string
          enrichment_source: string
          enrichment_type: string
          household_id: string
          id: string
          matched_value: string | null
          metadata: Json
          plaid_import_id: string | null
          quick_entry_id: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          enrichment_source: string
          enrichment_type: string
          household_id: string
          id?: string
          matched_value?: string | null
          metadata?: Json
          plaid_import_id?: string | null
          quick_entry_id?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          enrichment_source?: string
          enrichment_type?: string
          household_id?: string
          id?: string
          matched_value?: string | null
          metadata?: Json
          plaid_import_id?: string | null
          quick_entry_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_enrichments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_review_items: {
        Row: {
          answer: string | null
          created_at: string
          household_id: string
          id: string
          question: string
          resolved_at: string | null
          status: string
          suggestion_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          household_id: string
          id?: string
          question: string
          resolved_at?: string | null
          status?: string
          suggestion_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          household_id?: string
          id?: string
          question?: string
          resolved_at?: string | null
          status?: string
          suggestion_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_review_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_review_items_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "transaction_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_rules: {
        Row: {
          category: string
          confidence_score: number | null
          created_at: string
          household_id: string
          id: string
          is_active: boolean
          metadata: Json
          owner: string | null
          pattern: string
          rule_type: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          confidence_score?: number | null
          created_at?: string
          household_id: string
          id?: string
          is_active?: boolean
          metadata?: Json
          owner?: string | null
          pattern: string
          rule_type: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          confidence_score?: number | null
          created_at?: string
          household_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          owner?: string | null
          pattern?: string
          rule_type?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_suggestions: {
        Row: {
          confidence_score: number | null
          created_at: string
          household_id: string
          id: string
          metadata: Json
          plaid_import_id: string | null
          quick_entry_id: string | null
          reason: string | null
          source: string
          status: string
          suggested_category: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          household_id: string
          id?: string
          metadata?: Json
          plaid_import_id?: string | null
          quick_entry_id?: string | null
          reason?: string | null
          source: string
          status?: string
          suggested_category: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          household_id?: string
          id?: string
          metadata?: Json
          plaid_import_id?: string | null
          quick_entry_id?: string | null
          reason?: string | null
          source?: string
          status?: string
          suggested_category?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string | null
          credit_card_id: string | null
          description: string
          id: string
          notes: string | null
          person_id: string | null
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string | null
          credit_card_id?: string | null
          description: string
          id?: string
          notes?: string | null
          person_id?: string | null
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string | null
          credit_card_id?: string | null
          description?: string
          id?: string
          notes?: string | null
          person_id?: string | null
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      variable_income: {
        Row: {
          actual_amount: number | null
          client_name: string | null
          created_at: string | null
          expected_amount: number | null
          id: string
          income_date: string
          notes: string | null
          owner: string | null
          source: string
        }
        Insert: {
          actual_amount?: number | null
          client_name?: string | null
          created_at?: string | null
          expected_amount?: number | null
          id?: string
          income_date?: string
          notes?: string | null
          owner?: string | null
          source: string
        }
        Update: {
          actual_amount?: number | null
          client_name?: string | null
          created_at?: string | null
          expected_amount?: number | null
          id?: string
          income_date?: string
          notes?: string | null
          owner?: string | null
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_review_transaction: {
        Args: {
          p_category: string
          p_note?: string
          p_owner?: string
          p_plaid_import_id: string
          p_planning_item_id?: string
          p_transaction_type: string
        }
        Returns: Json
      }
      record_planning_fund_movement: {
        Args: {
          p_amount: number
          p_notes?: string
          p_planning_item_id: string
          p_transaction_type: string
        }
        Returns: {
          amount: number
          canonical_category: string | null
          created_at: string | null
          from_item_id: string | null
          household_id: string
          household_owner: string | null
          id: string
          notes: string | null
          plaid_import_id: string | null
          planning_item_id: string | null
          quick_entry_id: string | null
          to_item_id: string | null
          transaction_type: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "planning_item_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
