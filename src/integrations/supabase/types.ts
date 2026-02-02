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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      api_integrations: {
        Row: {
          api_key_encrypted: string
          base_url: string
          created_at: string
          description: string | null
          error_count: number | null
          headers: Json | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          request_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_encrypted: string
          base_url: string
          created_at?: string
          description?: string | null
          error_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          request_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_encrypted?: string
          base_url?: string
          created_at?: string
          description?: string | null
          error_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          request_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          document_id: string | null
          id: string
          role: string
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          document_id?: string | null
          id?: string
          role: string
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string | null
          id?: string
          role?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content_hash: string | null
          created_at: string
          encrypted_content: string
          expires_at: string | null
          id: string
          is_read: boolean | null
          iv: string
          media_url: string | null
          message_type: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          encrypted_content: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          iv: string
          media_url?: string | null
          message_type?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          encrypted_content?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          iv?: string
          media_url?: string | null
          message_type?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_public: boolean | null
          name: string
          subcategory: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          subcategory?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          subcategory?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          alias: string
          category: string | null
          content_text: string | null
          created_at: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          name: string
          summary: string | null
          tags: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          alias: string
          category?: string | null
          content_text?: string | null
          created_at?: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          name: string
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          alias?: string
          category?: string | null
          content_text?: string | null
          created_at?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          name?: string
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      group_chat_members: {
        Row: {
          group_id: string | null
          id: string
          joined_at: string
          role: string | null
          user_id: string
        }
        Insert: {
          group_id?: string | null
          id?: string
          joined_at?: string
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string | null
          id?: string
          joined_at?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chat_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string | null
          id: string
          media_url: string | null
          message_type: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id?: string | null
          id?: string
          media_url?: string | null
          message_type?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          media_url?: string | null
          message_type?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chats: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_private: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_private?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_private?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_files: {
        Row: {
          alias: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_path: string | null
          file_size: number | null
          id: string
          media_type: string
          name: string
          source_type: string
          source_url: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alias?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          media_type: string
          name: string
          source_type: string
          source_url?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          media_type?: string
          name?: string
          source_type?: string
          source_url?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      media_qa: {
        Row: {
          answer: string
          created_at: string
          id: string
          media_id: string
          question: string
          relevant_segment_ids: string[] | null
          relevant_timestamps: number[] | null
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          media_id: string
          question: string
          relevant_segment_ids?: string[] | null
          relevant_timestamps?: number[] | null
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          media_id?: string
          question?: string
          relevant_segment_ids?: string[] | null
          relevant_timestamps?: number[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_qa_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
        ]
      }
      media_segments: {
        Row: {
          confidence: number | null
          created_at: string
          end_time: number
          id: string
          is_key_moment: boolean | null
          media_id: string
          segment_index: number
          speaker_id: string | null
          speaker_label: string | null
          start_time: number
          text: string
          transcript_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          end_time: number
          id?: string
          is_key_moment?: boolean | null
          media_id: string
          segment_index: number
          speaker_id?: string | null
          speaker_label?: string | null
          start_time: number
          text: string
          transcript_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          end_time?: number
          id?: string
          is_key_moment?: boolean | null
          media_id?: string
          segment_index?: number
          speaker_id?: string | null
          speaker_label?: string | null
          start_time?: number
          text?: string
          transcript_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_segments_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_segments_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "media_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      media_transcripts: {
        Row: {
          created_at: string
          full_text: string
          id: string
          language: string | null
          media_id: string
          processing_time_ms: number | null
          speakers_detected: number | null
        }
        Insert: {
          created_at?: string
          full_text: string
          id?: string
          language?: string | null
          media_id: string
          processing_time_ms?: number | null
          speakers_detected?: number | null
        }
        Update: {
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          media_id?: string
          processing_time_ms?: number | null
          speakers_detected?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_transcripts_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          last_seen: string | null
          public_key: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen?: string | null
          public_key?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen?: string | null
          public_key?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_chats: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          session_id: string | null
          share_token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          session_id?: string | null
          share_token: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          session_id?: string | null
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_chats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_documents: {
        Row: {
          created_at: string
          document_id: string | null
          expires_at: string | null
          id: string
          share_token: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          expires_at?: string | null
          id?: string
          share_token: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          expires_at?: string | null
          id?: string
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_indicators: {
        Row: {
          group_id: string | null
          id: string
          is_typing: boolean | null
          recipient_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id?: string | null
          id?: string
          is_typing?: boolean | null
          recipient_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string | null
          id?: string
          is_typing?: boolean | null
          recipient_id?: string | null
          updated_at?: string
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
