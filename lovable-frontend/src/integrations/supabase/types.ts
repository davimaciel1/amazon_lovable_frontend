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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown | null
          resource_id: string | null
          resource_type: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          permissions: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          permissions?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          resource: string
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          resource: string
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          resource?: string
        }
        Relationships: []
      }
      product_cogs: {
        Row: {
          armazenagem: number | null
          asin: string
          comissao_amazon: number | null
          compra: number | null
          cost_period_end: string | null
          cost_period_start: string
          created_at: string
          currency: string
          custo_variavel: number | null
          frete_amazon: number | null
          id: string
          import_tax_cost: number | null
          imposto: number | null
          inbound_shipping_cost: number | null
          inspection_cost: number | null
          logistica_amazon: number | null
          margem_contribuicao: number | null
          notes: string | null
          other_product_costs: number | null
          percentual_lucro: number | null
          receita_bruta: number | null
          region_shipping_cost: number | null
          sku: string | null
          total_cogs: number | null
          updated_at: string
          user_id: string
          wholesale_cost: number | null
        }
        Insert: {
          armazenagem?: number | null
          asin: string
          comissao_amazon?: number | null
          compra?: number | null
          cost_period_end?: string | null
          cost_period_start?: string
          created_at?: string
          currency?: string
          custo_variavel?: number | null
          frete_amazon?: number | null
          id?: string
          import_tax_cost?: number | null
          imposto?: number | null
          inbound_shipping_cost?: number | null
          inspection_cost?: number | null
          logistica_amazon?: number | null
          margem_contribuicao?: number | null
          notes?: string | null
          other_product_costs?: number | null
          percentual_lucro?: number | null
          receita_bruta?: number | null
          region_shipping_cost?: number | null
          sku?: string | null
          total_cogs?: number | null
          updated_at?: string
          user_id: string
          wholesale_cost?: number | null
        }
        Update: {
          armazenagem?: number | null
          asin?: string
          comissao_amazon?: number | null
          compra?: number | null
          cost_period_end?: string | null
          cost_period_start?: string
          created_at?: string
          currency?: string
          custo_variavel?: number | null
          frete_amazon?: number | null
          id?: string
          import_tax_cost?: number | null
          imposto?: number | null
          inbound_shipping_cost?: number | null
          inspection_cost?: number | null
          logistica_amazon?: number | null
          margem_contribuicao?: number | null
          notes?: string | null
          other_product_costs?: number | null
          percentual_lucro?: number | null
          receita_bruta?: number | null
          region_shipping_cost?: number | null
          sku?: string | null
          total_cogs?: number | null
          updated_at?: string
          user_id?: string
          wholesale_cost?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department: string | null
          failed_login_attempts: number | null
          full_name: string | null
          id: string
          job_title: string | null
          language: string | null
          last_login_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string | null
          timezone: string | null
          two_factor_enabled: boolean | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          failed_login_attempts?: number | null
          full_name?: string | null
          id: string
          job_title?: string | null
          language?: string | null
          last_login_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string | null
          timezone?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          failed_login_attempts?: number | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          language?: string | null
          last_login_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string | null
          timezone?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string | null
          dashboard_layout: Json | null
          default_date_range: number | null
          default_marketplace: string | null
          id: string
          notification_email: boolean | null
          notification_push: boolean | null
          notification_sms: boolean | null
          saved_filters: Json | null
          table_density: Database["public"]["Enums"]["table_density"] | null
          theme: Database["public"]["Enums"]["theme_preference"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dashboard_layout?: Json | null
          default_date_range?: number | null
          default_marketplace?: string | null
          id?: string
          notification_email?: boolean | null
          notification_push?: boolean | null
          notification_sms?: boolean | null
          saved_filters?: Json | null
          table_density?: Database["public"]["Enums"]["table_density"] | null
          theme?: Database["public"]["Enums"]["theme_preference"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          dashboard_layout?: Json | null
          default_date_range?: number | null
          default_marketplace?: string | null
          id?: string
          notification_email?: boolean | null
          notification_push?: boolean | null
          notification_sms?: boolean | null
          saved_filters?: Json | null
          table_density?: Database["public"]["Enums"]["table_density"] | null
          theme?: Database["public"]["Enums"]["theme_preference"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      notification_type: "email" | "sms" | "push"
      table_density: "compact" | "comfortable" | "spacious"
      theme_preference: "light" | "dark" | "system"
      user_role: "owner" | "admin" | "manager" | "analyst" | "viewer"
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
      notification_type: ["email", "sms", "push"],
      table_density: ["compact", "comfortable", "spacious"],
      theme_preference: ["light", "dark", "system"],
      user_role: ["owner", "admin", "manager", "analyst", "viewer"],
    },
  },
} as const
