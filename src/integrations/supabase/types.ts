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
      bot_activity_logs: {
        Row: {
          bot_id: string
          conversation_id: string | null
          created_at: string
          endpoint: string
          error: string | null
          id: string
          latency_ms: number | null
          status: number
        }
        Insert: {
          bot_id: string
          conversation_id?: string | null
          created_at?: string
          endpoint: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          status: number
        }
        Update: {
          bot_id?: string
          conversation_id?: string | null
          created_at?: string
          endpoint?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_activity_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_tokens: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_tokens_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          last_used_at: string | null
          owner_id: string
          request_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id: string
          last_used_at?: string | null
          owner_id: string
          request_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          owner_id?: string
          request_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bots_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_invites: {
        Row: {
          channel_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          token: string
          uses: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          uses?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_invites_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["channel_role"]
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["channel_role"]
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["channel_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_views: {
        Row: {
          post_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          post_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_posts: {
        Row: {
          author_id: string
          channel_id: string
          content: string | null
          created_at: string
          edited_at: string | null
          id: string
          media_name: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          pinned: boolean
          view_count: number
        }
        Insert: {
          author_id: string
          channel_id: string
          content?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          pinned?: boolean
          view_count?: number
        }
        Update: {
          author_id?: string
          channel_id?: string
          content?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          pinned?: boolean
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          slug: string | null
          subscriber_count: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          slug?: string | null
          subscriber_count?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          slug?: string | null
          subscriber_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      conversation_bans: {
        Row: {
          banned_at: string
          banned_by: string | null
          conversation_id: string
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          conversation_id: string
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          conversation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_bans_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_invites: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          token: string
          uses: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          uses?: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_invites_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string
          muted_until: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string
          muted_until?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
          muted_until?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_group: boolean
          last_message_at: string
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string
          name?: string | null
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          media_mime: string | null
          media_name: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          media_mime?: string | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          media_mime?: string | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          is_bot: boolean
          last_seen: string | null
          show_last_seen: boolean
          status: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          is_bot?: boolean
          last_seen?: string | null
          show_last_seen?: boolean
          status?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_bot?: boolean
          last_seen?: string | null
          show_last_seen?: boolean
          status?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      channel_is_public: { Args: { _channel_id: string }; Returns: boolean }
      create_channel: {
        Args: {
          _avatar_url: string
          _description: string
          _is_public: boolean
          _name: string
          _slug: string
        }
        Returns: string
      }
      create_group: {
        Args: {
          _avatar_url: string
          _description: string
          _member_ids: string[]
          _name: string
        }
        Returns: string
      }
      increment_bot_request_count: {
        Args: { _bot_id: string }
        Returns: undefined
      }
      is_channel_admin: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_channel_owner: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conv_id: string; _user_id: string }
        Returns: boolean
      }
      join_channel_by_invite: { Args: { _token: string }; Returns: string }
      join_conversation_by_invite: { Args: { _token: string }; Returns: string }
      start_direct_conversation: {
        Args: { _other_user: string }
        Returns: string
      }
    }
    Enums: {
      channel_role: "owner" | "admin" | "subscriber"
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
      channel_role: ["owner", "admin", "subscriber"],
    },
  },
} as const
