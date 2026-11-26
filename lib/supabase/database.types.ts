export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_limits: {
        Row: {
          app_daily_requests: number;
          id: boolean;
          per_user_question_runs: number;
          per_user_summaries: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          app_daily_requests: number;
          id?: boolean;
          per_user_question_runs: number;
          per_user_summaries: number;
          updated_at?: string;
        };
        Update: {
          app_daily_requests?: number;
          id?: boolean;
          per_user_question_runs?: number;
          per_user_summaries?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          app_day: string;
          created_at: string;
          day: string;
          id: string;
          input_tokens: number | null;
          model: string | null;
          operation: string;
          output_tokens: number | null;
          provider: string | null;
          requests: number;
          status: string;
          updated_at: string;
          user_id: string;
          ai_usage_counts: boolean | null;
        };
        ComputedFields: "ai_usage_counts";
        Insert: {
          app_day: string;
          created_at?: string;
          day: string;
          id?: string;
          input_tokens?: number | null;
          model?: string | null;
          operation: string;
          output_tokens?: number | null;
          provider?: string | null;
          requests?: number;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          app_day?: string;
          created_at?: string;
          day?: string;
          id?: string;
          input_tokens?: number | null;
          model?: string | null;
          operation?: string;
          output_tokens?: number | null;
          provider?: string | null;
          requests?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      assessments: {
        Row: {
          completed_at: string | null;
          created_at: string;
          date: string;
          description: string | null;
          id: string;
          kind: string;
          subject_id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          date: string;
          description?: string | null;
          id?: string;
          kind: string;
          subject_id: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          date?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          subject_id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      attempt_answers: {
        Row: {
          attempt_id: string;
          correct: boolean | null;
          created_at: string;
          id: string;
          marked: boolean;
          question_id: string;
          response: Json | null;
          self_assessment: string | null;
          time_ms: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempt_id: string;
          correct?: boolean | null;
          created_at?: string;
          id?: string;
          marked?: boolean;
          question_id: string;
          response?: Json | null;
          self_assessment?: string | null;
          time_ms?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          attempt_id?: string;
          correct?: boolean | null;
          created_at?: string;
          id?: string;
          marked?: boolean;
          question_id?: string;
          response?: Json | null;
          self_assessment?: string | null;
          time_ms?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_user_id_fkey";
            columns: ["attempt_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "test_attempts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "attempt_answers_question_id_user_id_fkey";
            columns: ["question_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      document_chunks: {
        Row: {
          created_at: string;
          document_id: string;
          id: string;
          page: number;
          position: number;
          text: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_id: string;
          id?: string;
          page: number;
          position: number;
          text: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          id?: string;
          page?: number;
          position?: number;
          text?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      documents: {
        Row: {
          content_hash: string | null;
          created_at: string;
          excluded_pages: number[];
          file_id: string;
          id: string;
          language: string;
          page_count: number | null;
          pages_approx: boolean;
          status: string;
          updated_at: string;
          used_ocr: boolean;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_hash?: string | null;
          created_at?: string;
          excluded_pages?: number[];
          file_id: string;
          id?: string;
          language?: string;
          page_count?: number | null;
          pages_approx?: boolean;
          status?: string;
          updated_at?: string;
          used_ocr?: boolean;
          user_id?: string;
        };
        Update: {
          content_hash?: string | null;
          created_at?: string;
          excluded_pages?: number[];
          file_id?: string;
          id?: string;
          language?: string;
          page_count?: number | null;
          pages_approx?: boolean;
          status?: string;
          updated_at?: string;
          used_ocr?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_file_id_user_id_fkey";
            columns: ["file_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      files: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          mime_type: string;
          name: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          subject_id: string | null;
          updated_at: string;
          uploaded_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          mime_type: string;
          name: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          subject_id?: string | null;
          updated_at?: string;
          uploaded_at?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          mime_type?: string;
          name?: string;
          sha256?: string;
          size_bytes?: number;
          storage_path?: string;
          subject_id?: string | null;
          updated_at?: string;
          uploaded_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      focus_sessions: {
        Row: {
          actual_min: number;
          completed: boolean;
          created_at: string;
          ended_at: string;
          id: string;
          kind: string;
          planned_min: number;
          started_at: string;
          subject_id: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          actual_min: number;
          completed?: boolean;
          created_at?: string;
          ended_at: string;
          id?: string;
          kind?: string;
          planned_min: number;
          started_at: string;
          subject_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          actual_min?: number;
          completed?: boolean;
          created_at?: string;
          ended_at?: string;
          id?: string;
          kind?: string;
          planned_min?: number;
          started_at?: string;
          subject_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "focus_sessions_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      goals: {
        Row: {
          completed_at: string | null;
          created_at: string;
          date: string;
          duration_min: number | null;
          id: string;
          subject_id: string | null;
          time_of_day: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          date: string;
          duration_min?: number | null;
          id?: string;
          subject_id?: string | null;
          time_of_day?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          date?: string;
          duration_min?: number | null;
          id?: string;
          subject_id?: string | null;
          time_of_day?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          ai_notice_accepted_at: string | null;
          avatar_path: string | null;
          course: string;
          created_at: string;
          daily_focus_goal_min: number;
          focus_animation: boolean;
          focus_breath_text: boolean;
          focus_sound: string;
          focus_volume: number;
          id: string;
          institution: string;
          name: string;
          onboarding_completed_at: string | null;
          semester: number | null;
          show_in_ranking: boolean;
          theme: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          ai_notice_accepted_at?: string | null;
          avatar_path?: string | null;
          course?: string;
          created_at?: string;
          daily_focus_goal_min?: number;
          focus_animation?: boolean;
          focus_breath_text?: boolean;
          focus_sound?: string;
          focus_volume?: number;
          id: string;
          institution?: string;
          name?: string;
          onboarding_completed_at?: string | null;
          semester?: number | null;
          show_in_ranking?: boolean;
          theme?: string;
          updated_at?: string;
        };
        Update: {
          ai_notice_accepted_at?: string | null;
          avatar_path?: string | null;
          course?: string;
          created_at?: string;
          daily_focus_goal_min?: number;
          focus_animation?: boolean;
          focus_breath_text?: boolean;
          focus_sound?: string;
          focus_volume?: number;
          id?: string;
          institution?: string;
          name?: string;
          onboarding_completed_at?: string | null;
          semester?: number | null;
          show_in_ranking?: boolean;
          theme?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          answer: NonNullable<Json>;
          batch_key: string | null;
          created_at: string;
          difficulty: string;
          document_id: string | null;
          explanation: string;
          id: string;
          model: string | null;
          options: Json | null;
          origin: string;
          provider: string | null;
          source: Json | null;
          statement: string;
          status: string;
          subject_id: string | null;
          summary_id: string | null;
          topic: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answer: NonNullable<Json>;
          batch_key?: string | null;
          created_at?: string;
          difficulty: string;
          document_id?: string | null;
          explanation?: string;
          id?: string;
          model?: string | null;
          options?: Json | null;
          origin?: string;
          provider?: string | null;
          source?: Json | null;
          statement: string;
          status?: string;
          subject_id?: string | null;
          summary_id?: string | null;
          topic: string;
          type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          answer?: NonNullable<Json>;
          batch_key?: string | null;
          created_at?: string;
          difficulty?: string;
          document_id?: string | null;
          explanation?: string;
          id?: string;
          model?: string | null;
          options?: Json | null;
          origin?: string;
          provider?: string | null;
          source?: Json | null;
          statement?: string;
          status?: string;
          subject_id?: string | null;
          summary_id?: string | null;
          topic?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "questions_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "questions_summary_id_user_id_fkey";
            columns: ["summary_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "summaries";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      subject_topics: {
        Row: {
          created_at: string;
          done: boolean;
          id: string;
          position: number;
          subject_id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          done?: boolean;
          id?: string;
          position?: number;
          subject_id: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          done?: boolean;
          id?: string;
          position?: number;
          subject_id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_topics_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      subjects: {
        Row: {
          archived: boolean;
          color: string;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          professor: string | null;
          schedule_slots: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived?: boolean;
          color: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          professor?: string | null;
          schedule_slots?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived?: boolean;
          color?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          professor?: string | null;
          schedule_slots?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      summaries: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          detail: string;
          document_ids: string[];
          edited_by_user: boolean;
          focus: string | null;
          id: string;
          input_key: string | null;
          model: string | null;
          provider: string | null;
          subject_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          content: NonNullable<Json>;
          created_at?: string;
          detail: string;
          document_ids?: string[];
          edited_by_user?: boolean;
          focus?: string | null;
          id?: string;
          input_key?: string | null;
          model?: string | null;
          provider?: string | null;
          subject_id?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          detail?: string;
          document_ids?: string[];
          edited_by_user?: boolean;
          focus?: string | null;
          id?: string;
          input_key?: string | null;
          model?: string | null;
          provider?: string | null;
          subject_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "summaries_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      test_attempts: {
        Row: {
          completed: boolean;
          created_at: string;
          finished_at: string | null;
          id: string;
          mode: string;
          question_ids: string[];
          score: number | null;
          started_at: string;
          test_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed?: boolean;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          mode: string;
          question_ids: string[];
          score?: number | null;
          started_at?: string;
          test_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed?: boolean;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          mode?: string;
          question_ids?: string[];
          score?: number | null;
          started_at?: string;
          test_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_attempts_test_id_user_id_fkey";
            columns: ["test_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      tests: {
        Row: {
          config: NonNullable<Json>;
          created_at: string;
          id: string;
          question_ids: string[];
          subject_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          config?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          question_ids: string[];
          subject_id?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          config?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          question_ids?: string[];
          subject_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tests_subject_id_user_id_fkey";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      focus_days: {
        Row: {
          day: string | null;
          minutes: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      ai_remaining: {
        Args: Record<PropertyKey, never>;
        Returns: {
          app_open: boolean;
          question_runs: number;
          summaries: number;
        }[];
      };
      ai_reserve: { Args: { p_operation: string; p_requests: number }; Returns: string };
      ai_settle: {
        Args: {
          p_id: string;
          p_input_tokens: number;
          p_model: string;
          p_ok: boolean;
          p_output_tokens: number;
          p_provider: string;
          p_requests: number;
        };
        Returns: undefined;
      };
      ai_usage_counts: {
        Args: {
          u: Omit<
            Database["public"]["Tables"]["ai_usage"]["Row"],
            Database["public"]["Tables"]["ai_usage"]["ComputedFields"]
          >;
        };
        Returns: boolean;
      };
      save_extraction: {
        Args: {
          p_chunks: Json;
          p_content_hash: string;
          p_document: string;
          p_page_count: number;
          p_pages_approx: boolean;
          p_used_ocr: boolean;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
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
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
