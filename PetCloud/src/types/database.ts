// GENERADO AUTOMÁTICAMENTE por `npm run db:types`. No editar a mano:
// cualquier cambio se pierde en la próxima regeneración.
//
// Para que este archivo cambie, cambiá el esquema con una migración nueva en
// `db/migrations/` y volvé a generarlo.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  erp: {
    Tables: {
      account_movements: {
        Row: {
          amount_cents: number;
          created_at: string;
          created_by: string | null;
          customer_id: string;
          id: string;
          institution_id: string;
          kind: string;
          note: string | null;
          sale_id: string | null;
          voided_at: string | null;
          voided_by: string | null;
          voids_movement_id: string | null;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          id?: string;
          institution_id: string;
          kind: string;
          note?: string | null;
          sale_id?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          voids_movement_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          id?: string;
          institution_id?: string;
          kind?: string;
          note?: string | null;
          sale_id?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          voids_movement_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "account_movements_customer_same_institution_fkey";
            columns: ["customer_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "account_movements_sale_same_institution_fkey";
            columns: ["sale_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "account_movements_voids_same_institution_fkey";
            columns: ["voids_movement_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "account_movements";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      cash_accounts: {
        Row: {
          balance_cents: number;
          created_at: string;
          id: string;
          institution_id: string;
        };
        Insert: {
          balance_cents?: number;
          created_at?: string;
          id?: string;
          institution_id: string;
        };
        Update: {
          balance_cents?: number;
          created_at?: string;
          id?: string;
          institution_id?: string;
        };
        Relationships: [];
      };
      cash_movements: {
        Row: {
          amount_cents: number;
          cash_account_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          institution_id: string;
          kind: string;
          note: string | null;
          quantity: number | null;
          sale_id: string | null;
          voided_at: string | null;
          voided_by: string | null;
          voids_movement_id: string | null;
        };
        Insert: {
          amount_cents: number;
          cash_account_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          institution_id: string;
          kind: string;
          note?: string | null;
          quantity?: number | null;
          sale_id?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          voids_movement_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          cash_account_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          institution_id?: string;
          kind?: string;
          note?: string | null;
          quantity?: number | null;
          sale_id?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          voids_movement_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cash_movements_account_same_institution_fkey";
            columns: ["cash_account_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "cash_movements_sale_same_institution_fkey";
            columns: ["sale_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "cash_movements_voids_same_institution_fkey";
            columns: ["voids_movement_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "cash_movements";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      catalog_barcodes: {
        Row: {
          catalog_product_id: string;
          created_at: string;
          gtin: string;
        };
        Insert: {
          catalog_product_id: string;
          created_at?: string;
          gtin: string;
        };
        Update: {
          catalog_product_id?: string;
          created_at?: string;
          gtin?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_barcodes_catalog_product_id_fkey";
            columns: ["catalog_product_id"];
            isOneToOne: false;
            referencedRelation: "catalog_products";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_products: {
        Row: {
          created_at: string;
          created_by: string | null;
          created_by_institution_id: string | null;
          id: string;
          laboratory: string | null;
          name: string;
          presentation: string | null;
          primary_gtin: string;
          product_type: string;
          source_cat1: string | null;
          source_cat2: string | null;
          species: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          created_by_institution_id?: string | null;
          id?: string;
          laboratory?: string | null;
          name: string;
          presentation?: string | null;
          primary_gtin: string;
          product_type: string;
          source_cat1?: string | null;
          source_cat2?: string | null;
          species?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          created_by_institution_id?: string | null;
          id?: string;
          laboratory?: string | null;
          name?: string;
          presentation?: string | null;
          primary_gtin?: string;
          product_type?: string;
          source_cat1?: string | null;
          source_cat2?: string | null;
          species?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          active: boolean;
          balance_cents: number;
          condicion_iva: string;
          created_at: string;
          credit_limit_cents: number | null;
          domicilio: string | null;
          email: string | null;
          id: string;
          institution_id: string;
          numero_documento: string | null;
          phone: string | null;
          profile_id: string | null;
          razon_social: string;
          tipo_documento: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          balance_cents?: number;
          condicion_iva: string;
          created_at?: string;
          credit_limit_cents?: number | null;
          domicilio?: string | null;
          email?: string | null;
          id?: string;
          institution_id: string;
          numero_documento?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          razon_social: string;
          tipo_documento: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          balance_cents?: number;
          condicion_iva?: string;
          created_at?: string;
          credit_limit_cents?: number | null;
          domicilio?: string | null;
          email?: string | null;
          id?: string;
          institution_id?: string;
          numero_documento?: string | null;
          phone?: string | null;
          profile_id?: string | null;
          razon_social?: string;
          tipo_documento?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      module_grants: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          institution_id: string;
          module: string;
          professional_id: string;
          revoked_at: string | null;
          revoked_by: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          institution_id: string;
          module: string;
          professional_id: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          institution_id?: string;
          module?: string;
          professional_id?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          active: boolean;
          code: string;
          label: string;
          posts_account: boolean;
          posts_cash: boolean;
          requires_customer: boolean;
        };
        Insert: {
          active?: boolean;
          code: string;
          label: string;
          posts_account?: boolean;
          posts_cash?: boolean;
          requires_customer?: boolean;
        };
        Update: {
          active?: boolean;
          code?: string;
          label?: string;
          posts_account?: boolean;
          posts_cash?: boolean;
          requires_customer?: boolean;
        };
        Relationships: [];
      };
      product_barcodes: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          institution_id: string;
          product_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          institution_id: string;
          product_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          institution_id?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_institution_id_fkey";
            columns: ["product_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          category: string | null;
          cost_cents: number;
          created_at: string;
          id: string;
          institution_id: string;
          laboratory: string | null;
          min_stock: number;
          name: string;
          presentation: string | null;
          price_cents: number;
          sku: string | null;
          stock: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category?: string | null;
          cost_cents?: number;
          created_at?: string;
          id?: string;
          institution_id: string;
          laboratory?: string | null;
          min_stock?: number;
          name: string;
          presentation?: string | null;
          price_cents?: number;
          sku?: string | null;
          stock?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: string | null;
          cost_cents?: number;
          created_at?: string;
          id?: string;
          institution_id?: string;
          laboratory?: string | null;
          min_stock?: number;
          name?: string;
          presentation?: string | null;
          price_cents?: number;
          sku?: string | null;
          stock?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_items: {
        Row: {
          created_at: string;
          id: string;
          institution_id: string;
          product_id: string;
          purchase_id: string;
          quantity: number;
          unit_cost_cents: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          institution_id: string;
          product_id: string;
          purchase_id: string;
          quantity: number;
          unit_cost_cents: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          institution_id?: string;
          product_id?: string;
          purchase_id?: string;
          quantity?: number;
          unit_cost_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_same_institution_fkey";
            columns: ["product_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "purchase_items_purchase_same_institution_fkey";
            columns: ["purchase_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      purchases: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          institution_id: string;
          note: string | null;
          status: string;
          supplier_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          institution_id: string;
          note?: string | null;
          status?: string;
          supplier_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          institution_id?: string;
          note?: string | null;
          status?: string;
          supplier_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_same_institution_fkey";
            columns: ["supplier_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      sale_items: {
        Row: {
          created_at: string;
          id: string;
          institution_id: string;
          product_id: string;
          quantity: number;
          sale_id: string;
          unit_cost_cents: number | null;
          unit_price_cents: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          institution_id: string;
          product_id: string;
          quantity: number;
          sale_id: string;
          unit_cost_cents?: number | null;
          unit_price_cents: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          institution_id?: string;
          product_id?: string;
          quantity?: number;
          sale_id?: string;
          unit_cost_cents?: number | null;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sale_items_product_same_institution_fkey";
            columns: ["product_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "sale_items_sale_same_institution_fkey";
            columns: ["sale_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      sales: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          fiscal_snapshot: Json | null;
          id: string;
          institution_id: string;
          payment_method: string;
          status: string;
          total_cents: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          fiscal_snapshot?: Json | null;
          id?: string;
          institution_id: string;
          payment_method: string;
          status?: string;
          total_cents: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          fiscal_snapshot?: Json | null;
          id?: string;
          institution_id?: string;
          payment_method?: string;
          status?: string;
          total_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_customer_same_institution_fkey";
            columns: ["customer_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "sales_payment_method_fkey";
            columns: ["payment_method"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["code"];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          institution_id: string;
          kind: string;
          note: string | null;
          product_id: string;
          quantity: number;
          reason: string | null;
          unit_cost_cents: number | null;
          voided_at: string | null;
          voided_by: string | null;
          voids_movement_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          institution_id: string;
          kind: string;
          note?: string | null;
          product_id: string;
          quantity: number;
          reason?: string | null;
          unit_cost_cents?: number | null;
          voided_at?: string | null;
          voided_by?: string | null;
          voids_movement_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          institution_id?: string;
          kind?: string;
          note?: string | null;
          product_id?: string;
          quantity?: number;
          reason?: string | null;
          unit_cost_cents?: number | null;
          voided_at?: string | null;
          voided_by?: string | null;
          voids_movement_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_same_institution_fkey";
            columns: ["product_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "stock_movements_voids_same_institution_fkey";
            columns: ["voids_movement_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "stock_movements";
            referencedColumns: ["id", "institution_id"];
          },
        ];
      };
      suppliers: {
        Row: {
          active: boolean;
          created_at: string;
          email: string | null;
          id: string;
          institution_id: string;
          name: string;
          phone: string | null;
          tax_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          institution_id: string;
          name: string;
          phone?: string | null;
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          institution_id?: string;
          name?: string;
          phone?: string | null;
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      catalog_add: {
        Args: {
          p_gtin: string;
          p_laboratory?: string;
          p_name: string;
          p_presentation?: string;
          p_product_type: string;
          p_species: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          created_by_institution_id: string | null;
          id: string;
          laboratory: string | null;
          name: string;
          presentation: string | null;
          primary_gtin: string;
          product_type: string;
          source_cat1: string | null;
          source_cat2: string | null;
          species: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "catalog_products";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fks_hacia_public: {
        Args: never;
        Returns: {
          columnas: string;
          destino: string;
          es_compuesta: boolean;
          nombre: string;
          tabla: string;
        }[];
      };
      fks_internas: {
        Args: never;
        Returns: {
          columnas: string;
          es_compuesta: boolean;
          nombre: string;
          tabla: string;
        }[];
      };
      has_access:
        | { Args: { p_institution_id: string }; Returns: boolean }
        | {
            Args: { p_institution_id: string; p_module: string };
            Returns: boolean;
          };
      my_institution_id: { Args: never; Returns: string };
      normalize_gtin: { Args: { p_code: string }; Returns: string };
      record_arqueo: {
        Args: { p_counted_cents: number; p_reason?: string };
        Returns: string;
      };
      record_cash_movement: {
        Args: { p_amount_cents: number; p_kind: string; p_note?: string };
        Returns: string;
      };
      register_account_payment: { Args: { p_payload: Json }; Returns: string };
      register_purchase: { Args: { p_payload: Json }; Returns: string };
      register_sale: { Args: { p_payload: Json }; Returns: string };
      void_account_movement: {
        Args: { p_movement_id: string; p_reason?: string };
        Returns: string;
      };
      void_cash_movement: {
        Args: { p_movement_id: string; p_reason?: string };
        Returns: string;
      };
      void_movement: {
        Args: { p_movement_id: string; p_reason?: string };
        Returns: string;
      };
      void_sale: {
        Args: { p_reason?: string; p_sale_id: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_action_log: {
        Row: {
          action: string;
          actor_label: string;
          actor_profile_id: string | null;
          actor_role: string;
          details: Json;
          id: string;
          occurred_at: string;
          target_id: string | null;
          target_label: string;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_label: string;
          actor_profile_id?: string | null;
          actor_role: string;
          details?: Json;
          id?: string;
          occurred_at?: string;
          target_id?: string | null;
          target_label: string;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_label?: string;
          actor_profile_id?: string | null;
          actor_role?: string;
          details?: Json;
          id?: string;
          occurred_at?: string;
          target_id?: string | null;
          target_label?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_action_log_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          created_at: string;
          created_by: string | null;
          duration_min: number;
          id: string;
          institution_id: string;
          internal_notes: string | null;
          pet_id: string | null;
          professional_id: string | null;
          reason: string;
          starts_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          duration_min?: number;
          id?: string;
          institution_id: string;
          internal_notes?: string | null;
          pet_id?: string | null;
          professional_id?: string | null;
          reason: string;
          starts_at: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          duration_min?: number;
          id?: string;
          institution_id?: string;
          internal_notes?: string | null;
          pet_id?: string | null;
          professional_id?: string | null;
          reason?: string;
          starts_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_locations: {
        Row: {
          address: string;
          campaign_id: string;
          created_at: string;
          days: string;
          hours: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          place_name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          address?: string;
          campaign_id: string;
          created_at?: string;
          days?: string;
          hours?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          place_name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          address?: string;
          campaign_id?: string;
          created_at?: string;
          days?: string;
          hours?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          place_name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_locations_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_neighborhoods: {
        Row: {
          campaign_id: string;
          created_at: string;
          neighborhood_id: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          neighborhood_id: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          neighborhood_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_neighborhoods_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_neighborhoods_neighborhood_id_fkey";
            columns: ["neighborhood_id"];
            isOneToOne: false;
            referencedRelation: "municipality_neighborhoods";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_participating_vets: {
        Row: {
          added_at: string;
          added_by: string | null;
          campaign_id: string;
          vet_institution_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          campaign_id: string;
          vet_institution_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          campaign_id?: string;
          vet_institution_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_participating_vets_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "municipality_staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_participating_vets_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_participating_vets_vet_institution_id_fkey";
            columns: ["vet_institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_qr_sessions: {
        Row: {
          application_route:
            Database["public"]["Enums"]["application_route"] | null;
          booster_interval_days: number;
          campaign_id: string;
          code: string;
          created_at: string;
          dose_number: string | null;
          id: string;
          institution_id: string;
          issued_by: string | null;
          lot_number: string;
          manufacturer: string | null;
          preset_id: string | null;
          revoked_at: string | null;
          species: Database["public"]["Enums"]["pet_species"][];
          updated_at: string;
          vaccine_name: string;
          valid_from: string;
          valid_until: string;
        };
        Insert: {
          application_route?:
            Database["public"]["Enums"]["application_route"] | null;
          booster_interval_days?: number;
          campaign_id: string;
          code: string;
          created_at?: string;
          dose_number?: string | null;
          id?: string;
          institution_id: string;
          issued_by?: string | null;
          lot_number: string;
          manufacturer?: string | null;
          preset_id?: string | null;
          revoked_at?: string | null;
          species?: Database["public"]["Enums"]["pet_species"][];
          updated_at?: string;
          vaccine_name: string;
          valid_from?: string;
          valid_until: string;
        };
        Update: {
          application_route?:
            Database["public"]["Enums"]["application_route"] | null;
          booster_interval_days?: number;
          campaign_id?: string;
          code?: string;
          created_at?: string;
          dose_number?: string | null;
          id?: string;
          institution_id?: string;
          issued_by?: string | null;
          lot_number?: string;
          manufacturer?: string | null;
          preset_id?: string | null;
          revoked_at?: string | null;
          species?: Database["public"]["Enums"]["pet_species"][];
          updated_at?: string;
          vaccine_name?: string;
          valid_from?: string;
          valid_until?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_qr_sessions_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_qr_sessions_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_qr_sessions_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_qr_sessions_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "vaccine_presets";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigns: {
        Row: {
          channels: string[];
          created_at: string;
          description: string;
          ends_on: string;
          id: string;
          is_free: boolean;
          municipality_id: string;
          name: string;
          open_to_non_residents: boolean;
          reason: string;
          requirements: string[];
          service_type: string;
          starts_on: string;
          status: string;
          target_doses: number | null;
          updated_at: string;
          vaccines: string[];
        };
        Insert: {
          channels?: string[];
          created_at?: string;
          description?: string;
          ends_on: string;
          id?: string;
          is_free?: boolean;
          municipality_id: string;
          name: string;
          open_to_non_residents?: boolean;
          reason?: string;
          requirements?: string[];
          service_type: string;
          starts_on: string;
          status?: string;
          target_doses?: number | null;
          updated_at?: string;
          vaccines?: string[];
        };
        Update: {
          channels?: string[];
          created_at?: string;
          description?: string;
          ends_on?: string;
          id?: string;
          is_free?: boolean;
          municipality_id?: string;
          name?: string;
          open_to_non_residents?: boolean;
          reason?: string;
          requirements?: string[];
          service_type?: string;
          starts_on?: string;
          status?: string;
          target_doses?: number | null;
          updated_at?: string;
          vaccines?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "campaigns_municipality_id_fkey";
            columns: ["municipality_id"];
            isOneToOne: false;
            referencedRelation: "municipalities";
            referencedColumns: ["id"];
          },
        ];
      };
      conditions: {
        Row: {
          created_at: string;
          created_by_id: string | null;
          description: string | null;
          diagnosed_at: string | null;
          diagnosed_by_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          pet_id: string;
          type: Database["public"]["Enums"]["condition_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by_id?: string | null;
          description?: string | null;
          diagnosed_at?: string | null;
          diagnosed_by_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          pet_id: string;
          type: Database["public"]["Enums"]["condition_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by_id?: string | null;
          description?: string | null;
          diagnosed_at?: string | null;
          diagnosed_by_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          pet_id?: string;
          type?: Database["public"]["Enums"]["condition_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conditions_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conditions_diagnosed_by_id_fkey";
            columns: ["diagnosed_by_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conditions_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_messages: {
        Row: {
          ciudad: string | null;
          created_at: string;
          email: string;
          id: string;
          mensaje: string;
          nombre: string;
          organizacion: string | null;
          telefono: string;
          tipo: Database["public"]["Enums"]["contact_message_type"];
          turnstile_verdict: string | null;
        };
        Insert: {
          ciudad?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          mensaje: string;
          nombre: string;
          organizacion?: string | null;
          telefono: string;
          tipo: Database["public"]["Enums"]["contact_message_type"];
          turnstile_verdict?: string | null;
        };
        Update: {
          ciudad?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          mensaje?: string;
          nombre?: string;
          organizacion?: string | null;
          telefono?: string;
          tipo?: Database["public"]["Enums"]["contact_message_type"];
          turnstile_verdict?: string | null;
        };
        Relationships: [];
      };
      dewormings: {
        Row: {
          applied_at: string;
          applied_by_id: string | null;
          created_at: string;
          created_by_id: string | null;
          id: string;
          medical_record_id: string | null;
          next_application_at: string | null;
          pet_id: string;
          product_name: string;
          type: Database["public"]["Enums"]["deworming_type"];
          updated_at: string;
          verified: boolean;
        };
        Insert: {
          applied_at: string;
          applied_by_id?: string | null;
          created_at?: string;
          created_by_id?: string | null;
          id?: string;
          medical_record_id?: string | null;
          next_application_at?: string | null;
          pet_id: string;
          product_name: string;
          type: Database["public"]["Enums"]["deworming_type"];
          updated_at?: string;
          verified?: boolean;
        };
        Update: {
          applied_at?: string;
          applied_by_id?: string | null;
          created_at?: string;
          created_by_id?: string | null;
          id?: string;
          medical_record_id?: string | null;
          next_application_at?: string | null;
          pet_id?: string;
          product_name?: string;
          type?: Database["public"]["Enums"]["deworming_type"];
          updated_at?: string;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "dewormings_applied_by_id_fkey";
            columns: ["applied_by_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dewormings_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dewormings_medical_record_id_fkey";
            columns: ["medical_record_id"];
            isOneToOne: false;
            referencedRelation: "medical_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dewormings_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      lost_pet_sightings: {
        Row: {
          address_text: string | null;
          created_at: string;
          id: string;
          latitude: number;
          longitude: number;
          notes: string | null;
          pet_id: string;
          reported_by_id: string | null;
          reporter_name: string | null;
          reporter_phone: string | null;
          source: Database["public"]["Enums"]["sighting_source"];
          updated_at: string;
        };
        Insert: {
          address_text?: string | null;
          created_at?: string;
          id?: string;
          latitude: number;
          longitude: number;
          notes?: string | null;
          pet_id: string;
          reported_by_id?: string | null;
          reporter_name?: string | null;
          reporter_phone?: string | null;
          source?: Database["public"]["Enums"]["sighting_source"];
          updated_at?: string;
        };
        Update: {
          address_text?: string | null;
          created_at?: string;
          id?: string;
          latitude?: number;
          longitude?: number;
          notes?: string | null;
          pet_id?: string;
          reported_by_id?: string | null;
          reporter_name?: string | null;
          reporter_phone?: string | null;
          source?: Database["public"]["Enums"]["sighting_source"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lost_pet_sightings_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lost_pet_sightings_reported_by_id_fkey";
            columns: ["reported_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      medical_records: {
        Row: {
          created_at: string;
          date: string;
          diagnosis: string | null;
          id: string;
          institution_id: string | null;
          is_draft: boolean;
          is_signed: boolean;
          next_visit_date: string | null;
          observations: string | null;
          pet_id: string;
          reason: string | null;
          signature_id: string | null;
          signed_at: string | null;
          type: Database["public"]["Enums"]["record_type"];
          updated_at: string;
          vet_professional_id: string | null;
          weight_at_visit: number | null;
        };
        Insert: {
          created_at?: string;
          date?: string;
          diagnosis?: string | null;
          id?: string;
          institution_id?: string | null;
          is_draft?: boolean;
          is_signed?: boolean;
          next_visit_date?: string | null;
          observations?: string | null;
          pet_id: string;
          reason?: string | null;
          signature_id?: string | null;
          signed_at?: string | null;
          type?: Database["public"]["Enums"]["record_type"];
          updated_at?: string;
          vet_professional_id?: string | null;
          weight_at_visit?: number | null;
        };
        Update: {
          created_at?: string;
          date?: string;
          diagnosis?: string | null;
          id?: string;
          institution_id?: string | null;
          is_draft?: boolean;
          is_signed?: boolean;
          next_visit_date?: string | null;
          observations?: string | null;
          pet_id?: string;
          reason?: string | null;
          signature_id?: string | null;
          signed_at?: string | null;
          type?: Database["public"]["Enums"]["record_type"];
          updated_at?: string;
          vet_professional_id?: string | null;
          weight_at_visit?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "medical_records_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medical_records_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medical_records_signature_id_fkey";
            columns: ["signature_id"];
            isOneToOne: false;
            referencedRelation: "vet_signatures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medical_records_vet_professional_id_fkey";
            columns: ["vet_professional_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      medications: {
        Row: {
          administration_route: string | null;
          created_at: string;
          created_by_id: string | null;
          dosage: string | null;
          end_date: string | null;
          frequency: string | null;
          id: string;
          instructions: string | null;
          medical_record_id: string | null;
          name: string;
          owner_notes: string | null;
          pet_id: string;
          prescribed_by_id: string | null;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          administration_route?: string | null;
          created_at?: string;
          created_by_id?: string | null;
          dosage?: string | null;
          end_date?: string | null;
          frequency?: string | null;
          id?: string;
          instructions?: string | null;
          medical_record_id?: string | null;
          name: string;
          owner_notes?: string | null;
          pet_id: string;
          prescribed_by_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          administration_route?: string | null;
          created_at?: string;
          created_by_id?: string | null;
          dosage?: string | null;
          end_date?: string | null;
          frequency?: string | null;
          id?: string;
          instructions?: string | null;
          medical_record_id?: string | null;
          name?: string;
          owner_notes?: string | null;
          pet_id?: string;
          prescribed_by_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medications_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medications_medical_record_id_fkey";
            columns: ["medical_record_id"];
            isOneToOne: false;
            referencedRelation: "medical_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medications_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medications_prescribed_by_id_fkey";
            columns: ["prescribed_by_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      municipalities: {
        Row: {
          center_address: string;
          center_latitude: number | null;
          center_longitude: number | null;
          contact_email: string | null;
          created_at: string;
          id: string;
          mandatory_vaccines: Json;
          name: string;
          ordinance_text: string;
          phone: string | null;
          province: string;
          radius_km: number;
          short_name: string;
          slug: string;
          tax_id: string | null;
          updated_at: string;
          validated: boolean;
          validated_at: string | null;
          website: string | null;
        };
        Insert: {
          center_address?: string;
          center_latitude?: number | null;
          center_longitude?: number | null;
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          mandatory_vaccines?: Json;
          name: string;
          ordinance_text?: string;
          phone?: string | null;
          province?: string;
          radius_km?: number;
          short_name: string;
          slug: string;
          tax_id?: string | null;
          updated_at?: string;
          validated?: boolean;
          validated_at?: string | null;
          website?: string | null;
        };
        Update: {
          center_address?: string;
          center_latitude?: number | null;
          center_longitude?: number | null;
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          mandatory_vaccines?: Json;
          name?: string;
          ordinance_text?: string;
          phone?: string | null;
          province?: string;
          radius_km?: number;
          short_name?: string;
          slug?: string;
          tax_id?: string | null;
          updated_at?: string;
          validated?: boolean;
          validated_at?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      municipality_census_access_log: {
        Row: {
          action: string;
          actor_label: string;
          actor_profile_id: string | null;
          actor_role: string;
          export_filters: Json | null;
          id: string;
          ip_address: unknown;
          municipality_id: string;
          occurred_at: string;
          pet_id: string | null;
          pet_label: string | null;
          record_count: number | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_label: string;
          actor_profile_id?: string | null;
          actor_role: string;
          export_filters?: Json | null;
          id?: string;
          ip_address?: unknown;
          municipality_id: string;
          occurred_at?: string;
          pet_id?: string | null;
          pet_label?: string | null;
          record_count?: number | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_label?: string;
          actor_profile_id?: string | null;
          actor_role?: string;
          export_filters?: Json | null;
          id?: string;
          ip_address?: unknown;
          municipality_id?: string;
          occurred_at?: string;
          pet_id?: string | null;
          pet_label?: string | null;
          record_count?: number | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "municipality_census_access_log_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "municipality_census_access_log_municipality_id_fkey";
            columns: ["municipality_id"];
            isOneToOne: false;
            referencedRelation: "municipalities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "municipality_census_access_log_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      municipality_neighborhoods: {
        Row: {
          created_at: string;
          estimated_population: number | null;
          id: string;
          municipality_id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          estimated_population?: number | null;
          id?: string;
          municipality_id: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          estimated_population?: number | null;
          id?: string;
          municipality_id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "municipality_neighborhoods_municipality_id_fkey";
            columns: ["municipality_id"];
            isOneToOne: false;
            referencedRelation: "municipalities";
            referencedColumns: ["id"];
          },
        ];
      };
      municipality_participating_vets: {
        Row: {
          id: string;
          invited_at: string;
          invited_by: string | null;
          municipality_id: string;
          responded_at: string | null;
          status: string;
          suspended_at: string | null;
          suspension_reason: string | null;
          vet_institution_id: string;
        };
        Insert: {
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
          municipality_id: string;
          responded_at?: string | null;
          status?: string;
          suspended_at?: string | null;
          suspension_reason?: string | null;
          vet_institution_id: string;
        };
        Update: {
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
          municipality_id?: string;
          responded_at?: string | null;
          status?: string;
          suspended_at?: string | null;
          suspension_reason?: string | null;
          vet_institution_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "municipality_participating_vets_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "municipality_staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "municipality_participating_vets_municipality_id_fkey";
            columns: ["municipality_id"];
            isOneToOne: false;
            referencedRelation: "municipalities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "municipality_participating_vets_vet_institution_id_fkey";
            columns: ["vet_institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      municipality_staff: {
        Row: {
          created_at: string;
          id: string;
          last_seen_at: string | null;
          municipality_id: string;
          profile_id: string;
          role_in_municipality: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_seen_at?: string | null;
          municipality_id: string;
          profile_id: string;
          role_in_municipality?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_seen_at?: string | null;
          municipality_id?: string;
          profile_id?: string;
          role_in_municipality?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "municipality_staff_municipality_id_fkey";
            columns: ["municipality_id"];
            isOneToOne: false;
            referencedRelation: "municipalities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "municipality_staff_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          link: string | null;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_access_requests: {
        Row: {
          created_at: string;
          id: string;
          requester_id: string;
          status: string;
          target_owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: string;
          target_owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: string;
          target_owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_access_requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_access_requests_target_owner_id_fkey";
            columns: ["target_owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_documents: {
        Row: {
          created_at: string;
          date: string;
          file_size: number | null;
          file_url: string;
          id: string;
          pet_id: string;
          signature_id: string | null;
          title: string;
          type: Database["public"]["Enums"]["document_type"];
          updated_at: string;
          uploaded_by_id: string | null;
        };
        Insert: {
          created_at?: string;
          date?: string;
          file_size?: number | null;
          file_url: string;
          id?: string;
          pet_id: string;
          signature_id?: string | null;
          title: string;
          type?: Database["public"]["Enums"]["document_type"];
          updated_at?: string;
          uploaded_by_id?: string | null;
        };
        Update: {
          created_at?: string;
          date?: string;
          file_size?: number | null;
          file_url?: string;
          id?: string;
          pet_id?: string;
          signature_id?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["document_type"];
          updated_at?: string;
          uploaded_by_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pet_documents_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_documents_signature_id_fkey";
            columns: ["signature_id"];
            isOneToOne: false;
            referencedRelation: "vet_signatures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_documents_uploaded_by_id_fkey";
            columns: ["uploaded_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_notes: {
        Row: {
          content: string;
          created_at: string;
          created_by_id: string | null;
          id: string;
          pet_id: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by_id?: string | null;
          id?: string;
          pet_id: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by_id?: string | null;
          id?: string;
          pet_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_notes_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_notes_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_qr_codes: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          pet_id: string;
          revoked_at: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          pet_id: string;
          revoked_at?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          pet_id?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pet_qr_codes_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_share_invites: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          invited_by: string;
          invited_email: string;
          inviter_name: string;
          permission: Database["public"]["Enums"]["share_permission"];
          pet_id: string;
          pet_name: string;
          responded_at: string | null;
          status: Database["public"]["Enums"]["share_invite_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          invited_email: string;
          inviter_name: string;
          permission?: Database["public"]["Enums"]["share_permission"];
          pet_id: string;
          pet_name: string;
          responded_at?: string | null;
          status?: Database["public"]["Enums"]["share_invite_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          invited_email?: string;
          inviter_name?: string;
          permission?: Database["public"]["Enums"]["share_permission"];
          pet_id?: string;
          pet_name?: string;
          responded_at?: string | null;
          status?: Database["public"]["Enums"]["share_invite_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_share_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_share_invites_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_shared_access: {
        Row: {
          created_at: string;
          id: string;
          permission: Database["public"]["Enums"]["share_permission"];
          pet_id: string;
          shared_with_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          permission?: Database["public"]["Enums"]["share_permission"];
          pet_id: string;
          shared_with_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          permission?: Database["public"]["Enums"]["share_permission"];
          pet_id?: string;
          shared_with_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_shared_access_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_shared_access_shared_with_id_fkey";
            columns: ["shared_with_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pets: {
        Row: {
          blood_type: string | null;
          breed: string | null;
          color: string | null;
          created_at: string;
          date_of_birth: string | null;
          id: string;
          lost_address: string | null;
          lost_at: string | null;
          lost_latitude: number | null;
          lost_longitude: number | null;
          lost_notes: string | null;
          lost_photo_url: string | null;
          lost_radius_km: number | null;
          lost_status: Database["public"]["Enums"]["lost_status"];
          microchip_number: string | null;
          municipal_registry_number: string | null;
          name: string;
          neutered: boolean;
          owner_id: string;
          photo_url: string | null;
          primary_vet_institution_id: string | null;
          qr_code: string;
          qr_public_config: Json;
          sex: Database["public"]["Enums"]["pet_sex"] | null;
          species: Database["public"]["Enums"]["pet_species"];
          updated_at: string;
          weight: number | null;
        };
        Insert: {
          blood_type?: string | null;
          breed?: string | null;
          color?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          id?: string;
          lost_address?: string | null;
          lost_at?: string | null;
          lost_latitude?: number | null;
          lost_longitude?: number | null;
          lost_notes?: string | null;
          lost_photo_url?: string | null;
          lost_radius_km?: number | null;
          lost_status?: Database["public"]["Enums"]["lost_status"];
          microchip_number?: string | null;
          municipal_registry_number?: string | null;
          name: string;
          neutered?: boolean;
          owner_id: string;
          photo_url?: string | null;
          primary_vet_institution_id?: string | null;
          qr_code: string;
          qr_public_config?: Json;
          sex?: Database["public"]["Enums"]["pet_sex"] | null;
          species: Database["public"]["Enums"]["pet_species"];
          updated_at?: string;
          weight?: number | null;
        };
        Update: {
          blood_type?: string | null;
          breed?: string | null;
          color?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          id?: string;
          lost_address?: string | null;
          lost_at?: string | null;
          lost_latitude?: number | null;
          lost_longitude?: number | null;
          lost_notes?: string | null;
          lost_photo_url?: string | null;
          lost_radius_km?: number | null;
          lost_status?: Database["public"]["Enums"]["lost_status"];
          microchip_number?: string | null;
          municipal_registry_number?: string | null;
          name?: string;
          neutered?: boolean;
          owner_id?: string;
          photo_url?: string | null;
          primary_vet_institution_id?: string | null;
          qr_code?: string;
          qr_public_config?: Json;
          sex?: Database["public"]["Enums"]["pet_sex"] | null;
          species?: Database["public"]["Enums"]["pet_species"];
          updated_at?: string;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "pets_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pets_primary_vet_institution_id_fkey";
            columns: ["primary_vet_institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      premium_prices: {
        Row: {
          amount_cents: number;
          billing_period: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          effective_from: string;
          id: string;
          mp_preapproval_plan_id: string | null;
        };
        Insert: {
          amount_cents: number;
          billing_period?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          effective_from?: string;
          id?: string;
          mp_preapproval_plan_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          billing_period?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          effective_from?: string;
          id?: string;
          mp_preapproval_plan_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "premium_prices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          address: string | null;
          address_normalized: string | null;
          avatar_url: string | null;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          municipality_id: string | null;
          municipality_slug_legacy: string | null;
          neighborhood_id: string | null;
          notification_email_enabled: boolean;
          notification_push_enabled: boolean;
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          address_normalized?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          first_name?: string;
          id: string;
          last_name?: string;
          municipality_id?: string | null;
          municipality_slug_legacy?: string | null;
          neighborhood_id?: string | null;
          notification_email_enabled?: boolean;
          notification_push_enabled?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          address_normalized?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          municipality_id?: string | null;
          municipality_slug_legacy?: string | null;
          neighborhood_id?: string | null;
          notification_email_enabled?: boolean;
          notification_push_enabled?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_municipality_id_fkey";
            columns: ["municipality_id"];
            isOneToOne: false;
            referencedRelation: "municipalities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_neighborhood_id_fkey";
            columns: ["neighborhood_id"];
            isOneToOne: false;
            referencedRelation: "municipality_neighborhoods";
            referencedColumns: ["id"];
          },
        ];
      };
      reminders: {
        Row: {
          channel: Database["public"]["Enums"]["reminder_channel"];
          created_at: string;
          description: string | null;
          id: string;
          owner_id: string;
          pet_id: string;
          repeat: Database["public"]["Enums"]["reminder_repeat"];
          scheduled_at: string;
          sent_at: string | null;
          source: Database["public"]["Enums"]["reminder_source"];
          source_id: string | null;
          status: Database["public"]["Enums"]["reminder_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          channel?: Database["public"]["Enums"]["reminder_channel"];
          created_at?: string;
          description?: string | null;
          id?: string;
          owner_id: string;
          pet_id: string;
          repeat?: Database["public"]["Enums"]["reminder_repeat"];
          scheduled_at: string;
          sent_at?: string | null;
          source?: Database["public"]["Enums"]["reminder_source"];
          source_id?: string | null;
          status?: Database["public"]["Enums"]["reminder_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["reminder_channel"];
          created_at?: string;
          description?: string | null;
          id?: string;
          owner_id?: string;
          pet_id?: string;
          repeat?: Database["public"]["Enums"]["reminder_repeat"];
          scheduled_at?: string;
          sent_at?: string | null;
          source?: Database["public"]["Enums"]["reminder_source"];
          source_id?: string | null;
          status?: Database["public"]["Enums"]["reminder_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminders_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      vaccinations: {
        Row: {
          application_route:
            Database["public"]["Enums"]["application_route"] | null;
          applied_at: string;
          applied_by_id: string | null;
          campaign_id: string | null;
          created_at: string;
          created_by_id: string | null;
          declaration_session_id: string | null;
          declared_distance_m: number | null;
          dose_number: string | null;
          id: string;
          location: string | null;
          lot_number: string | null;
          manufacturer: string | null;
          medical_record_id: string | null;
          next_dose_at: string | null;
          pet_id: string;
          rejection_reason: string | null;
          review_status: string;
          reviewed_at: string | null;
          reviewed_by_id: string | null;
          signature_id: string | null;
          updated_at: string;
          vaccine_name: string;
          verified: boolean;
        };
        Insert: {
          application_route?:
            Database["public"]["Enums"]["application_route"] | null;
          applied_at: string;
          applied_by_id?: string | null;
          campaign_id?: string | null;
          created_at?: string;
          created_by_id?: string | null;
          declaration_session_id?: string | null;
          declared_distance_m?: number | null;
          dose_number?: string | null;
          id?: string;
          location?: string | null;
          lot_number?: string | null;
          manufacturer?: string | null;
          medical_record_id?: string | null;
          next_dose_at?: string | null;
          pet_id: string;
          rejection_reason?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by_id?: string | null;
          signature_id?: string | null;
          updated_at?: string;
          vaccine_name: string;
          verified?: boolean;
        };
        Update: {
          application_route?:
            Database["public"]["Enums"]["application_route"] | null;
          applied_at?: string;
          applied_by_id?: string | null;
          campaign_id?: string | null;
          created_at?: string;
          created_by_id?: string | null;
          declaration_session_id?: string | null;
          declared_distance_m?: number | null;
          dose_number?: string | null;
          id?: string;
          location?: string | null;
          lot_number?: string | null;
          manufacturer?: string | null;
          medical_record_id?: string | null;
          next_dose_at?: string | null;
          pet_id?: string;
          rejection_reason?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by_id?: string | null;
          signature_id?: string | null;
          updated_at?: string;
          vaccine_name?: string;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "vaccinations_applied_by_id_fkey";
            columns: ["applied_by_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_campaign_fk";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_declaration_session_id_fkey";
            columns: ["declaration_session_id"];
            isOneToOne: false;
            referencedRelation: "campaign_qr_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_medical_record_id_fkey";
            columns: ["medical_record_id"];
            isOneToOne: false;
            referencedRelation: "medical_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_reviewed_by_id_fkey";
            columns: ["reviewed_by_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_signature_id_fkey";
            columns: ["signature_id"];
            isOneToOne: false;
            referencedRelation: "vet_signatures";
            referencedColumns: ["id"];
          },
        ];
      };
      vaccine_presets: {
        Row: {
          application_route:
            Database["public"]["Enums"]["application_route"] | null;
          booster_interval_days: number | null;
          created_at: string;
          default_dose_number: string | null;
          id: string;
          initial_series_interval_days: number | null;
          institution_id: string;
          is_mandatory: boolean;
          manufacturer: string | null;
          species: Database["public"]["Enums"]["pet_species"][];
          updated_at: string;
          vaccine_name: string;
        };
        Insert: {
          application_route?:
            Database["public"]["Enums"]["application_route"] | null;
          booster_interval_days?: number | null;
          created_at?: string;
          default_dose_number?: string | null;
          id?: string;
          initial_series_interval_days?: number | null;
          institution_id: string;
          is_mandatory?: boolean;
          manufacturer?: string | null;
          species?: Database["public"]["Enums"]["pet_species"][];
          updated_at?: string;
          vaccine_name: string;
        };
        Update: {
          application_route?:
            Database["public"]["Enums"]["application_route"] | null;
          booster_interval_days?: number | null;
          created_at?: string;
          default_dose_number?: string | null;
          id?: string;
          initial_series_interval_days?: number | null;
          institution_id?: string;
          is_mandatory?: boolean;
          manufacturer?: string | null;
          species?: Database["public"]["Enums"]["pet_species"][];
          updated_at?: string;
          vaccine_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vaccine_presets_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      vet_institutions: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          latitude: number | null;
          logo_url: string | null;
          longitude: number | null;
          name: string;
          on_call_schedule: Json;
          phone: string | null;
          schedule: Json;
          updated_at: string;
          validated: boolean;
          validated_at: string | null;
          website: string | null;
        };
        Insert: {
          address?: string;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          name: string;
          on_call_schedule?: Json;
          phone?: string | null;
          schedule?: Json;
          updated_at?: string;
          validated?: boolean;
          validated_at?: string | null;
          website?: string | null;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          name?: string;
          on_call_schedule?: Json;
          phone?: string | null;
          schedule?: Json;
          updated_at?: string;
          validated?: boolean;
          validated_at?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      vet_license_reviews: {
        Row: {
          id: string;
          note: string | null;
          occurred_at: string;
          professional_id: string;
          reviewer_profile_id: string | null;
          validated: boolean;
        };
        Insert: {
          id?: string;
          note?: string | null;
          occurred_at?: string;
          professional_id: string;
          reviewer_profile_id?: string | null;
          validated: boolean;
        };
        Update: {
          id?: string;
          note?: string | null;
          occurred_at?: string;
          professional_id?: string;
          reviewer_profile_id?: string | null;
          validated?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "vet_license_reviews_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vet_license_reviews_reviewer_profile_id_fkey";
            columns: ["reviewer_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vet_professionals: {
        Row: {
          absence_status: string;
          created_at: string;
          id: string;
          institution_id: string;
          license_number: string | null;
          license_reviewed_at: string | null;
          license_validated: boolean;
          on_call: boolean;
          profile_id: string;
          removed_at: string | null;
          role_in_institution: string;
          signature_url: string | null;
          specialty: string | null;
          updated_at: string;
        };
        Insert: {
          absence_status?: string;
          created_at?: string;
          id?: string;
          institution_id: string;
          license_number?: string | null;
          license_reviewed_at?: string | null;
          license_validated?: boolean;
          on_call?: boolean;
          profile_id: string;
          removed_at?: string | null;
          role_in_institution?: string;
          signature_url?: string | null;
          specialty?: string | null;
          updated_at?: string;
        };
        Update: {
          absence_status?: string;
          created_at?: string;
          id?: string;
          institution_id?: string;
          license_number?: string | null;
          license_reviewed_at?: string | null;
          license_validated?: boolean;
          on_call?: boolean;
          profile_id?: string;
          removed_at?: string | null;
          role_in_institution?: string;
          signature_url?: string | null;
          specialty?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vet_professionals_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vet_professionals_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vet_signatures: {
        Row: {
          clarification: string;
          created_at: string;
          id: string;
          image_path: string | null;
          license_number: string;
          superseded_at: string | null;
          sworn_at: string;
          sworn_statement: string;
          vet_professional_id: string;
        };
        Insert: {
          clarification: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          license_number: string;
          superseded_at?: string | null;
          sworn_at?: string;
          sworn_statement: string;
          vet_professional_id: string;
        };
        Update: {
          clarification?: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          license_number?: string;
          superseded_at?: string | null;
          sworn_at?: string;
          sworn_statement?: string;
          vet_professional_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vet_signatures_vet_professional_id_fkey";
            columns: ["vet_professional_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      vet_subscription_events: {
        Row: {
          applied: boolean;
          id: string;
          occurred_at: string | null;
          payload: Json;
          provider: string;
          provider_event_id: string;
          provider_status: string | null;
          received_at: string;
          resource_id: string;
          subscription_id: string | null;
          topic: string;
        };
        Insert: {
          applied?: boolean;
          id?: string;
          occurred_at?: string | null;
          payload?: Json;
          provider?: string;
          provider_event_id: string;
          provider_status?: string | null;
          received_at?: string;
          resource_id: string;
          subscription_id?: string | null;
          topic: string;
        };
        Update: {
          applied?: boolean;
          id?: string;
          occurred_at?: string | null;
          payload?: Json;
          provider?: string;
          provider_event_id?: string;
          provider_status?: string | null;
          received_at?: string;
          resource_id?: string;
          subscription_id?: string | null;
          topic?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vet_subscription_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "vet_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      vet_subscriptions: {
        Row: {
          amount_cents: number;
          cancelled_at: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          current_period_end: string | null;
          grace_until: string | null;
          id: string;
          institution_id: string;
          price_id: string;
          provider: string;
          provider_subscription_id: string | null;
          provider_updated_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          current_period_end?: string | null;
          grace_until?: string | null;
          id?: string;
          institution_id: string;
          price_id: string;
          provider?: string;
          provider_subscription_id?: string | null;
          provider_updated_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          current_period_end?: string | null;
          grace_until?: string | null;
          id?: string;
          institution_id?: string;
          price_id?: string;
          provider?: string;
          provider_subscription_id?: string | null;
          provider_updated_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vet_subscriptions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vet_subscriptions_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: true;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vet_subscriptions_price_id_fkey";
            columns: ["price_id"];
            isOneToOne: false;
            referencedRelation: "premium_prices";
            referencedColumns: ["id"];
          },
        ];
      };
      vet_team_invites: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          institution_id: string;
          institution_name: string;
          invited_by: string;
          invited_email: string;
          inviter_name: string;
          responded_at: string | null;
          role_in_institution: string;
          status: Database["public"]["Enums"]["team_invite_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          institution_id: string;
          institution_name: string;
          invited_by: string;
          invited_email: string;
          inviter_name: string;
          responded_at?: string | null;
          role_in_institution?: string;
          status?: Database["public"]["Enums"]["team_invite_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          institution_id?: string;
          institution_name?: string;
          invited_by?: string;
          invited_email?: string;
          inviter_name?: string;
          responded_at?: string | null;
          role_in_institution?: string;
          status?: Database["public"]["Enums"]["team_invite_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vet_team_invites_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vet_team_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      visits: {
        Row: {
          appointment_id: string | null;
          checked_in_at: string;
          checked_in_by_id: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          institution_id: string;
          is_urgent: boolean;
          medical_record_id: string | null;
          owner_id: string;
          pet_id: string;
          reason: string | null;
          status: Database["public"]["Enums"]["visit_status"];
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          appointment_id?: string | null;
          checked_in_at?: string;
          checked_in_by_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          institution_id: string;
          is_urgent?: boolean;
          medical_record_id?: string | null;
          owner_id: string;
          pet_id: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["visit_status"];
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          appointment_id?: string | null;
          checked_in_at?: string;
          checked_in_by_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          institution_id?: string;
          is_urgent?: boolean;
          medical_record_id?: string | null;
          owner_id?: string;
          pet_id?: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["visit_status"];
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visits_appointment_same_institution_fkey";
            columns: ["appointment_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id", "institution_id"];
          },
          {
            foreignKeyName: "visits_checked_in_by_id_fkey";
            columns: ["checked_in_by_id"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_medical_record_id_fkey";
            columns: ["medical_record_id"];
            isOneToOne: false;
            referencedRelation: "medical_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      waiting_room_qr_sessions: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          institution_id: string;
          issued_by: string | null;
          revoked_at: string | null;
          updated_at: string;
          valid_from: string;
          valid_until: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          institution_id: string;
          issued_by?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
          valid_from?: string;
          valid_until: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          institution_id?: string;
          issued_by?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waiting_room_qr_sessions_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "vet_institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waiting_room_qr_sessions_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "vet_professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      weight_records: {
        Row: {
          created_at: string;
          created_by_id: string | null;
          id: string;
          note: string | null;
          pet_id: string;
          recorded_at: string;
          source: Database["public"]["Enums"]["weight_source"];
          updated_at: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          created_by_id?: string | null;
          id?: string;
          note?: string | null;
          pet_id: string;
          recorded_at?: string;
          source?: Database["public"]["Enums"]["weight_source"];
          updated_at?: string;
          value: number;
        };
        Update: {
          created_at?: string;
          created_by_id?: string | null;
          id?: string;
          note?: string | null;
          pet_id?: string;
          recorded_at?: string;
          source?: Database["public"]["Enums"]["weight_source"];
          updated_at?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weight_records_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weight_records_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_pet_share_invite: {
        Args: { p_invite_id: string };
        Returns: string;
      };
      accept_team_invite: {
        Args: { p_invite_id: string; p_license_number?: string };
        Returns: string;
      };
      admin_organization_directory: {
        Args: never;
        Returns: {
          address: string;
          created_at: string;
          id: string;
          name: string;
          phone: string;
          short_name: string;
          type: string;
          validated: boolean;
          website: string;
        }[];
      };
      admin_platform_metrics: { Args: never; Returns: Json };
      admin_register_municipality: {
        Args: {
          p_name: string;
          p_phone: string;
          p_province: string;
          p_short_name: string;
          p_slug: string;
          p_website: string;
        };
        Returns: string;
      };
      admin_set_account_suspension: {
        Args: { p_profile_id: string; p_suspend: boolean };
        Returns: boolean;
      };
      admin_set_platform_role: {
        Args: { p_email: string; p_grant: boolean };
        Returns: string;
      };
      admin_set_vet_license: {
        Args: {
          p_note?: string;
          p_professional_id: string;
          p_validated: boolean;
        };
        Returns: {
          professional_id: string;
          reviewed_at: string;
          validated: boolean;
        }[];
      };
      admin_user_directory: {
        Args: never;
        Returns: {
          address: string;
          banned_until: string;
          created_at: string;
          email: string;
          email_confirmed_at: string;
          first_name: string;
          last_name: string;
          last_sign_in_at: string;
          organizacion: string;
          phone: string;
          profile_id: string;
          role: Database["public"]["Enums"]["user_role"];
        }[];
      };
      campaign_is_public: { Args: { p_campaign_id: string }; Returns: boolean };
      campaign_municipality_id: {
        Args: { p_campaign_id: string };
        Returns: string;
      };
      campaign_qr_session_is_live: {
        Args: { p_campaign_id: string; p_session_id: string };
        Returns: boolean;
      };
      check_matching_pets_by_address: { Args: never; Returns: Json };
      close_visit_with_appointment: {
        Args: {
          p_medical_record_id?: string;
          p_summary?: string;
          p_visit_id: string;
        };
        Returns: {
          appointment_status: string;
          closed_visit_id: string;
          linked_appointment_id: string;
        }[];
      };
      count_effective_platform_admins: {
        Args: { p_exclude: string };
        Returns: number;
      };
      create_pet_access_request_by_address: {
        Args: never;
        Returns: {
          target_owner_id: string;
        }[];
      };
      current_vet_signature_id: { Args: never; Returns: string };
      decline_pet_share_invite: {
        Args: { p_invite_id: string };
        Returns: boolean;
      };
      decline_team_invite: { Args: { p_invite_id: string }; Returns: boolean };
      get_on_call_names: {
        Args: { p_institution_id: string };
        Returns: string[];
      };
      get_owner_upcoming_appointments: {
        Args: { p_limit?: number };
        Returns: {
          duration_min: number;
          id: string;
          institution_name: string;
          pet_id: string;
          pet_name: string;
          pet_photo_url: string;
          professional_name: string;
          reason: string;
          starts_at: string;
          status: string;
        }[];
      };
      get_pet_appointments: {
        Args: { p_pet_id: string };
        Returns: {
          duration_min: number;
          id: string;
          institution_name: string;
          professional_name: string;
          reason: string;
          starts_at: string;
          status: string;
        }[];
      };
      get_pet_owner_profile_for_vet: {
        Args: { p_pet_id: string };
        Returns: {
          address: string;
          avatar_url: string;
          first_name: string;
          id: string;
          last_name: string;
          phone: string;
        }[];
      };
      has_pet_access: {
        Args: {
          p_min_permission?: Database["public"]["Enums"]["share_permission"];
          p_pet_id: string;
        };
        Returns: boolean;
      };
      has_shared_pet_access: {
        Args: {
          p_min_permission?: Database["public"]["Enums"]["share_permission"];
          p_pet_id: string;
        };
        Returns: boolean;
      };
      institution_can_add_member: {
        Args: {
          p_include_pending?: boolean;
          p_institution_id: string;
          p_role: string;
        };
        Returns: boolean;
      };
      institution_has_premium: {
        Args: { p_institution_id: string };
        Returns: boolean;
      };
      is_institution_member: {
        Args: { p_institution_id: string };
        Returns: boolean;
      };
      is_institution_owner: {
        Args: { p_institution_id: string };
        Returns: boolean;
      };
      is_municipality: { Args: never; Returns: boolean };
      is_my_patient: { Args: { p_pet_id: string }; Returns: boolean };
      is_pet_owner: { Args: { p_pet_id: string }; Returns: boolean };
      is_platform_admin: { Args: never; Returns: boolean };
      is_valid_institution_schedule: {
        Args: { p_schedule: Json };
        Returns: boolean;
      };
      is_valid_on_call_schedule: { Args: { p_days: Json }; Returns: boolean };
      is_validated_municipality: { Args: never; Returns: boolean };
      is_validated_vet: { Args: never; Returns: boolean };
      is_vet: { Args: never; Returns: boolean };
      log_admin_action: {
        Args: {
          p_action: string;
          p_details?: Json;
          p_target_id: string;
          p_target_label: string;
          p_target_type: string;
        };
        Returns: string;
      };
      municipality_campaign_history_for_pet: {
        Args: { p_pet_id: string };
        Returns: {
          applied_at: string;
          campaign_id: string;
          campaign_name: string;
        }[];
      };
      municipality_campaign_progress: {
        Args: never;
        Returns: {
          applied_doses: number;
          campaign_id: string;
          self_declared_pending: number;
        }[];
      };
      municipality_census_export: {
        Args: { p_filters?: Json };
        Returns: {
          breed: string;
          color: string;
          date_of_birth: string;
          id: string;
          municipal_registry_number: string;
          name: string;
          neighborhood_id: string;
          neighborhood_name: string;
          neutered: boolean;
          owner_address: string;
          owner_email: string;
          owner_first_name: string;
          owner_last_name: string;
          owner_phone: string;
          qr_code: string;
          rabies_status: string;
          sex: Database["public"]["Enums"]["pet_sex"];
          species: Database["public"]["Enums"]["pet_species"];
        }[];
      };
      municipality_census_page: {
        Args: { p_filters?: Json };
        Returns: {
          breed: string;
          color: string;
          date_of_birth: string;
          id: string;
          municipal_registry_number: string;
          name: string;
          neighborhood_id: string;
          neighborhood_name: string;
          neutered: boolean;
          rabies_status: string;
          sex: Database["public"]["Enums"]["pet_sex"];
          species: Database["public"]["Enums"]["pet_species"];
        }[];
      };
      municipality_census_record: {
        Args: { p_pet_id: string };
        Returns: {
          breed: string;
          color: string;
          date_of_birth: string;
          id: string;
          municipal_registry_number: string;
          name: string;
          neighborhood_id: string;
          neighborhood_name: string;
          neutered: boolean;
          owner_address: string;
          owner_email: string;
          owner_first_name: string;
          owner_last_name: string;
          owner_phone: string;
          qr_code: string;
          rabies_status: string;
          sex: Database["public"]["Enums"]["pet_sex"];
          species: Database["public"]["Enums"]["pet_species"];
        }[];
      };
      municipality_coverage_by_neighborhood: {
        Args: never;
        Returns: {
          al_dia: number;
          cobertura: number;
          neighborhood_id: string;
          neighborhood_name: string;
          registradas: number;
        }[];
      };
      municipality_heatmap_cells: {
        Args: never;
        Returns: {
          cantidad: number;
          mes: string;
          neighborhood_id: string;
          neighborhood_name: string;
        }[];
      };
      municipality_monthly_registrations: {
        Args: never;
        Returns: {
          acumulado: number;
          altas: number;
          mes: string;
        }[];
      };
      municipality_panel_metrics: {
        Args: never;
        Returns: {
          cobertura: number;
          dosis_del_mes: number;
          registradas: number;
          sin_datos: number;
          vencidas: number;
        }[];
      };
      municipality_species_distribution: {
        Args: never;
        Returns: {
          cantidad: number;
          species: Database["public"]["Enums"]["pet_species"];
        }[];
      };
      municipality_stats_export: { Args: never; Returns: Json };
      my_institution_is_validated: { Args: never; Returns: boolean };
      my_municipality_id: { Args: never; Returns: string };
      my_municipality_role: { Args: never; Returns: string };
      my_patient_pet_ids: { Args: never; Returns: string[] };
      my_verified_email: { Args: never; Returns: string };
      my_vet_institution_id: { Args: never; Returns: string };
      my_vet_professional_id: { Args: never; Returns: string };
      normalize_address: { Args: { p_text: string }; Returns: string };
      owner_of_my_patient: { Args: { p_owner_id: string }; Returns: boolean };
      pet_owner_id: { Args: { p_pet_id: string }; Returns: string };
      public_rabies_status: { Args: { p_pet_id: string }; Returns: string };
      qr_session_institution_id: {
        Args: { p_session_id: string };
        Returns: string;
      };
      register_vet_signature: {
        Args: {
          p_clarification: string;
          p_image_path?: string;
          p_license_number: string;
          p_sworn_statement: string;
        };
        Returns: string;
      };
      resolve_campaign_qr_session: {
        Args: { p_code: string };
        Returns: {
          application_route: Database["public"]["Enums"]["application_route"];
          booster_interval_days: number;
          campaign_id: string;
          campaign_name: string;
          code: string;
          dose_number: string;
          locations: Json;
          lot_number: string;
          manufacturer: string;
          session_id: string;
          species: Database["public"]["Enums"]["pet_species"][];
          vaccine_name: string;
          valid_from: string;
          valid_until: string;
        }[];
      };
      respond_pet_access_request: {
        Args: {
          p_accept: boolean;
          p_permission?: Database["public"]["Enums"]["share_permission"];
          p_request_id: string;
        };
        Returns: boolean;
      };
      revoke_vet_team_member: {
        Args: { p_professional_id: string };
        Returns: boolean;
      };
      signature_object_unclaimed: {
        Args: { p_name: string };
        Returns: boolean;
      };
      signed_a_record_for_my_pet: {
        Args: { p_profile_id: string };
        Returns: boolean;
      };
      signed_for_my_pet: {
        Args: { p_professional_id: string };
        Returns: boolean;
      };
      split_provider_name: {
        Args: { meta: Json };
        Returns: {
          first_name: string;
          last_name: string;
        }[];
      };
      storage_pet_id: { Args: { object_name: string }; Returns: string };
      storage_professional_id: {
        Args: { object_name: string };
        Returns: string;
      };
      storage_profile_id: { Args: { object_name: string }; Returns: string };
      unaccent: { Args: { "": string }; Returns: string };
      vet_directorio_seguridad: {
        Args: never;
        Returns: {
          busqueda_es_security_definer: boolean;
          nombres_politicas_select: string[];
          politicas_select_abiertas: number;
        }[];
      };
      vet_institutions_nearby: {
        Args: { p_radius_km?: number };
        Returns: {
          address: string;
          distance_km: number;
          id: string;
          latitude: number;
          logo_url: string;
          longitude: number;
          name: string;
          on_call: boolean;
          on_call_names: string[];
          on_call_schedule: string[];
          phone: string;
          website: string;
        }[];
      };
      waiting_room_self_check_in: {
        Args: { p_code: string; p_pet_id: string };
        Returns: {
          outcome: string;
          visit_id: string;
        }[];
      };
    };
    Enums: {
      application_route: "injectable" | "oral" | "nasal" | "topical" | "other";
      condition_type: "disease" | "allergy" | "chronic";
      contact_message_type: "dueno" | "veterinaria" | "municipio";
      deworming_type: "internal" | "external" | "both";
      document_type: "study" | "prescription" | "certificate" | "other";
      lost_status: "safe" | "lost" | "found";
      notification_type:
        | "reminder"
        | "campaign"
        | "visit"
        | "lost_pet"
        | "pet_access"
        | "system";
      pet_sex: "male" | "female";
      pet_species: "dog" | "cat" | "other";
      record_type:
        | "checkup"
        | "emergency"
        | "surgery"
        | "vaccination"
        | "deworming"
        | "other";
      reminder_channel: "push" | "email" | "both";
      reminder_repeat: "once" | "daily" | "weekly" | "monthly" | "yearly";
      reminder_source:
        "manual" | "auto_vaccine" | "auto_deworming" | "auto_visit";
      reminder_status: "pending" | "sent" | "dismissed";
      share_invite_status: "pending" | "accepted" | "declined";
      share_permission: "view" | "edit" | "owner";
      sighting_source: "app" | "qr_scan";
      team_invite_status: "pending" | "accepted" | "declined";
      user_role: "owner" | "vet" | "municipality" | "admin";
      visit_status:
        "waiting" | "in_progress" | "completed" | "cancelled" | "no_show";
      weight_source: "owner" | "vet";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalDb">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
  erp: {
    Enums: {},
  },
  public: {
    Enums: {
      application_route: ["injectable", "oral", "nasal", "topical", "other"],
      condition_type: ["disease", "allergy", "chronic"],
      contact_message_type: ["dueno", "veterinaria", "municipio"],
      deworming_type: ["internal", "external", "both"],
      document_type: ["study", "prescription", "certificate", "other"],
      lost_status: ["safe", "lost", "found"],
      notification_type: [
        "reminder",
        "campaign",
        "visit",
        "lost_pet",
        "pet_access",
        "system",
      ],
      pet_sex: ["male", "female"],
      pet_species: ["dog", "cat", "other"],
      record_type: [
        "checkup",
        "emergency",
        "surgery",
        "vaccination",
        "deworming",
        "other",
      ],
      reminder_channel: ["push", "email", "both"],
      reminder_repeat: ["once", "daily", "weekly", "monthly", "yearly"],
      reminder_source: [
        "manual",
        "auto_vaccine",
        "auto_deworming",
        "auto_visit",
      ],
      reminder_status: ["pending", "sent", "dismissed"],
      share_invite_status: ["pending", "accepted", "declined"],
      share_permission: ["view", "edit", "owner"],
      sighting_source: ["app", "qr_scan"],
      team_invite_status: ["pending", "accepted", "declined"],
      user_role: ["owner", "vet", "municipality", "admin"],
      visit_status: [
        "waiting",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      weight_source: ["owner", "vet"],
    },
  },
} as const;
