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
      agent_messages: {
        Row: {
          content: string
          created_at: string
          domain: string | null
          evidence: Json
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          domain?: string | null
          evidence?: Json
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          domain?: string | null
          evidence?: Json
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_threads: {
        Row: {
          class_id: string
          created_at: string
          enrollment_id: string | null
          id: string
          teacher_id: string
          thread_type: string
          title: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          teacher_id: string
          thread_type: string
          title?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          teacher_id?: string
          thread_type?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_threads_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_threads_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_threads_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "agent_threads_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "agent_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_runs: {
        Row: {
          analysis_type: string
          category_tags: string[]
          created_at: string
          error_message: string | null
          id: string
          model: string | null
          moderation_flag: boolean
          needs_followup: boolean
          prompt_version: string
          provider: string
          result: Json
          schema_version: number
          source_id: string
          source_type: string
          status: string
        }
        Insert: {
          analysis_type: string
          category_tags?: string[]
          created_at?: string
          error_message?: string | null
          id?: string
          model?: string | null
          moderation_flag?: boolean
          needs_followup?: boolean
          prompt_version: string
          provider?: string
          result?: Json
          schema_version?: number
          source_id: string
          source_type: string
          status?: string
        }
        Update: {
          analysis_type?: string
          category_tags?: string[]
          created_at?: string
          error_message?: string | null
          id?: string
          model?: string | null
          moderation_flag?: boolean
          needs_followup?: boolean
          prompt_version?: string
          provider?: string
          result?: Json
          schema_version?: number
          source_id?: string
          source_type?: string
          status?: string
        }
        Relationships: []
      }
      asset_catalog: {
        Row: {
          asset_format: string
          asset_type: string
          created_at: string
          dedup_key: string
          generation_metadata: Json | null
          geometry_spec: Json | null
          id: string
          model_url: string
          name: string
          source: string
          status: string
          style_version: string
          thumbnail_url: string | null
        }
        Insert: {
          asset_format?: string
          asset_type: string
          created_at?: string
          dedup_key: string
          generation_metadata?: Json | null
          geometry_spec?: Json | null
          id?: string
          model_url: string
          name: string
          source: string
          status?: string
          style_version: string
          thumbnail_url?: string | null
        }
        Update: {
          asset_format?: string
          asset_type?: string
          created_at?: string
          dedup_key?: string
          generation_metadata?: Json | null
          geometry_spec?: Json | null
          id?: string
          model_url?: string
          name?: string
          source?: string
          status?: string
          style_version?: string
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          after: Json | null
          before: Json | null
          changed_at: string
          changed_by: string | null
          id: string
          row_id: string
          table_name: string
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          row_id: string
          table_name: string
        }
        Update: {
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      checkin_sessions: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          // 이지현 (제안, 2026-09-20): 공개 데모 방문자 격리용 — 마이그레이션
          // 20260920013300_1090_demo_owner_isolation.sql 참고. 이 필드는 이 파일이
          // 원래 자동 생성(supabase gen types)되는 파일이라, 그 마이그레이션이 실제
          // DB에 적용된 뒤 다시 생성하면 자동으로 반영된다 — 그 전까지 리뷰/빌드가
          // 가능하도록 수동으로 추가해둔 것이다.
          demo_owner_id: string | null
          enrollment_id: string
          id: string
          mood_color: string
          period: string
          prosody: Json | null
          session_date: string
          started_at: string
          status: string
          stop_reason: string | null
          transcript: Json | null
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          demo_owner_id?: string | null
          enrollment_id: string
          id?: string
          mood_color: string
          period: string
          prosody?: Json | null
          session_date?: string
          started_at?: string
          status?: string
          stop_reason?: string | null
          transcript?: Json | null
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          demo_owner_id?: string | null
          enrollment_id?: string
          id?: string
          mood_color?: string
          period?: string
          prosody?: Json | null
          session_date?: string
          started_at?: string
          status?: string
          stop_reason?: string | null
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "checkin_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "checkin_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
        ]
      }
      class_teachers: {
        Row: {
          class_id: string
          created_at: string
          role: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          role: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          role?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          grade: number
          id: string
          name: string
          school_id: string
          school_year: number
          semester: number
        }
        Insert: {
          created_at?: string
          grade: number
          id?: string
          name: string
          school_id: string
          school_year: number
          semester: number
        }
        Update: {
          created_at?: string
          grade?: number
          id?: string
          name?: string
          school_id?: string
          school_year?: number
          semester?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_statements: {
        Row: {
          content: string
          created_at: string
          enrollment_id: string | null
          id: string
          speaker_label: string
          work_record_id: string
        }
        Insert: {
          content: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          speaker_label: string
          work_record_id: string
        }
        Update: {
          content?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          speaker_label?: string
          work_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_statements_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_statements_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "conflict_statements_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "conflict_statements_work_record_id_fkey"
            columns: ["work_record_id"]
            isOneToOne: false
            referencedRelation: "work_records"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          consent_type: string
          consented_at: string
          created_at: string
          document_ref: string | null
          id: string
          recorded_by: string
          student_id: string
        }
        Insert: {
          consent_type: string
          consented_at?: string
          created_at?: string
          document_ref?: string | null
          id?: string
          recorded_by: string
          student_id: string
        }
        Update: {
          consent_type?: string
          consented_at?: string
          created_at?: string
          document_ref?: string | null
          id?: string
          recorded_by?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["student_id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string
          content_hash: string | null
          created_at: string
          id: string
          input_method: string
          prev_hash: string | null
          sequence: number
          session_id: string
          speaker: string
        }
        Insert: {
          content: string
          content_hash?: string | null
          created_at?: string
          id?: string
          input_method: string
          prev_hash?: string | null
          sequence: number
          session_id: string
          speaker: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          input_method?: string
          prev_hash?: string | null
          sequence?: number
          session_id?: string
          speaker?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "checkin_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_id: string
          created_at: string
          ended_on: string | null
          id: string
          seat_col: number
          seat_row: number
          started_on: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          ended_on?: string | null
          id?: string
          seat_col: number
          seat_row: number
          started_on: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          ended_on?: string | null
          id?: string
          seat_col?: number
          seat_row?: number
          started_on?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["student_id"]
          },
        ]
      }
      feedback_drafts: {
        Row: {
          created_at: string
          created_by: string
          draft_text: string
          enrollment_id: string
          final_text: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          draft_text: string
          enrollment_id: string
          final_text?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          draft_text?: string
          enrollment_id?: string
          final_text?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_drafts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_drafts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "feedback_drafts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
        ]
      }
      feedback_sources: {
        Row: {
          feedback_id: string
          session_id: string
        }
        Insert: {
          feedback_id: string
          session_id: string
        }
        Update: {
          feedback_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_sources_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_sources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "checkin_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      island_placements: {
        Row: {
          current_asset_id: string | null
          id: string
          island_id: string
          position_x: number
          position_y: number
          position_z: number
          rotation_x: number
          rotation_y: number
          rotation_z: number
          scale_x: number
          scale_y: number
          scale_z: number
          student_item_id: string
          updated_at: string
        }
        Insert: {
          current_asset_id?: string | null
          id?: string
          island_id: string
          position_x?: number
          position_y?: number
          position_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_x?: number
          scale_y?: number
          scale_z?: number
          student_item_id: string
          updated_at?: string
        }
        Update: {
          current_asset_id?: string | null
          id?: string
          island_id?: string
          position_x?: number
          position_y?: number
          position_z?: number
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale_x?: number
          scale_y?: number
          scale_z?: number
          student_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "island_placements_current_asset_id_fkey"
            columns: ["current_asset_id"]
            isOneToOne: false
            referencedRelation: "asset_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "island_placements_island_id_fkey"
            columns: ["island_id"]
            isOneToOne: false
            referencedRelation: "islands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "island_placements_student_item_id_fkey"
            columns: ["student_item_id"]
            isOneToOne: true
            referencedRelation: "student_items"
            referencedColumns: ["id"]
          },
        ]
      }
      islands: {
        Row: {
          created_at: string
          enrollment_id: string
          id: string
          name: string
          theme: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          id?: string
          name: string
          theme: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          id?: string
          name?: string
          theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "islands_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islands_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "islands_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
        ]
      }
      item_generation_jobs: {
        Row: {
          assembly_output: Json | null
          attempt_count: number
          candidate_id: string | null
          completed_at: string | null
          created_at: string
          enrollment_id: string
          fallback_asset_id: string | null
          fallback_at: string | null
          generated_asset_id: string | null
          id: string
          inference_output: Json | null
          last_error_at: string | null
          last_error_code: string | null
          last_error_detail: Json | null
          max_attempts: number
          next_attempt_at: string | null
          source_session_id: string
          started_at: string | null
          status: string
          student_item_id: string | null
          student_message: string | null
          updated_at: string
        }
        Insert: {
          assembly_output?: Json | null
          attempt_count?: number
          candidate_id?: string | null
          completed_at?: string | null
          created_at?: string
          enrollment_id: string
          fallback_asset_id?: string | null
          fallback_at?: string | null
          generated_asset_id?: string | null
          id?: string
          inference_output?: Json | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_detail?: Json | null
          max_attempts?: number
          next_attempt_at?: string | null
          source_session_id: string
          started_at?: string | null
          status?: string
          student_item_id?: string | null
          student_message?: string | null
          updated_at?: string
        }
        Update: {
          assembly_output?: Json | null
          attempt_count?: number
          candidate_id?: string | null
          completed_at?: string | null
          created_at?: string
          enrollment_id?: string
          fallback_asset_id?: string | null
          fallback_at?: string | null
          generated_asset_id?: string | null
          id?: string
          inference_output?: Json | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_detail?: Json | null
          max_attempts?: number
          next_attempt_at?: string | null
          source_session_id?: string
          started_at?: string | null
          status?: string
          student_item_id?: string | null
          student_message?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_generation_jobs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_generation_jobs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "item_generation_jobs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "item_generation_jobs_fallback_asset_id_fkey"
            columns: ["fallback_asset_id"]
            isOneToOne: false
            referencedRelation: "asset_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_generation_jobs_generated_asset_id_fkey"
            columns: ["generated_asset_id"]
            isOneToOne: false
            referencedRelation: "asset_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_generation_jobs_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: true
            referencedRelation: "checkin_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_generation_jobs_student_item_id_fkey"
            columns: ["student_item_id"]
            isOneToOne: false
            referencedRelation: "student_items"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_requests: {
        Row: {
          acknowledged_at: string | null
          enrollment_id: string
          id: string
          note: string | null
          priority: string
          requested_at: string
          requested_by: string
          resolved_at: string | null
          source_session_id: string | null
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          enrollment_id: string
          id?: string
          note?: string | null
          priority?: string
          requested_at?: string
          requested_by: string
          resolved_at?: string | null
          source_session_id?: string | null
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          enrollment_id?: string
          id?: string
          note?: string | null
          priority?: string
          requested_at?: string
          requested_by?: string
          resolved_at?: string | null
          source_session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_requests_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_requests_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "meeting_requests_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "meeting_requests_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "checkin_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_consultations: {
        Row: {
          counterpart: string | null
          created_at: string
          enrollment_id: string
          evidence_refs: Json
          id: string
          method: string | null
          notes: string
          scheduled_at: string | null
          status: string
          teacher_id: string
          updated_at: string
          work_record_id: string | null
        }
        Insert: {
          counterpart?: string | null
          created_at?: string
          enrollment_id: string
          evidence_refs?: Json
          id?: string
          method?: string | null
          notes?: string
          scheduled_at?: string | null
          status?: string
          teacher_id: string
          updated_at?: string
          work_record_id?: string | null
        }
        Update: {
          counterpart?: string | null
          created_at?: string
          enrollment_id?: string
          evidence_refs?: Json
          id?: string
          method?: string | null
          notes?: string
          scheduled_at?: string | null
          status?: string
          teacher_id?: string
          updated_at?: string
          work_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_consultations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_consultations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "parent_consultations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "parent_consultations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_consultations_work_record_id_fkey"
            columns: ["work_record_id"]
            isOneToOne: false
            referencedRelation: "work_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          role: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      student_items: {
        Row: {
          asset_id: string
          earned_at: string
          earned_on: string
          enrollment_id: string
          id: string
          is_core: boolean
          slot: number
          source_message_id: string | null
          source_session_id: string | null
        }
        Insert: {
          asset_id: string
          earned_at?: string
          earned_on?: string
          enrollment_id: string
          id?: string
          is_core?: boolean
          slot: number
          source_message_id?: string | null
          source_session_id?: string | null
        }
        Update: {
          asset_id?: string
          earned_at?: string
          earned_on?: string
          enrollment_id?: string
          id?: string
          is_core?: boolean
          slot?: number
          source_message_id?: string | null
          source_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_items_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_items_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "student_items_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "student_items_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_items_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "checkin_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          id: string
          login_code: string | null
          status: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          login_code?: string | null
          status?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          login_code?: string | null
          status?: string
        }
        Relationships: []
      }
      view_log: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "view_log_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_record_students: {
        Row: {
          enrollment_id: string
          participant_role: string | null
          work_record_id: string
        }
        Insert: {
          enrollment_id: string
          participant_role?: string | null
          work_record_id: string
        }
        Update: {
          enrollment_id?: string
          participant_role?: string | null
          work_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_record_students_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_record_students_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_signal_flags"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "work_record_students_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "v_students_current"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "work_record_students_work_record_id_fkey"
            columns: ["work_record_id"]
            isOneToOne: false
            referencedRelation: "work_records"
            referencedColumns: ["id"]
          },
        ]
      }
      work_records: {
        Row: {
          body: string
          body_tsv: unknown
          class_id: string
          created_at: string
          created_by: string
          id: string
          occurred_at: string
          record_type: string
          sealed_at: string | null
          status: string
          supersedes_id: string | null
          title: string
        }
        Insert: {
          body: string
          body_tsv?: unknown
          class_id: string
          created_at?: string
          created_by: string
          id?: string
          occurred_at: string
          record_type: string
          sealed_at?: string | null
          status?: string
          supersedes_id?: string | null
          title: string
        }
        Update: {
          body?: string
          body_tsv?: unknown
          class_id?: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_at?: string
          record_type?: string
          sealed_at?: string | null
          status?: string
          supersedes_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_records_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "work_records"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_signal_flags: {
        Row: {
          analysis_type: string | null
          category_tags: string[] | null
          class_id: string | null
          created_at: string | null
          enrollment_id: string | null
          moderation_flag: boolean | null
          needs_followup: boolean | null
          result: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_students_current: {
        Row: {
          class_id: string | null
          display_name: string | null
          enrollment_id: string | null
          seat_col: number | null
          seat_row: number | null
          status: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_actor: { Args: never; Returns: string }
      get_student_context: {
        Args: { p_enrollment_id: string; p_since?: string }
        Returns: Json
      }
      is_class_teacher: { Args: { p_class_id: string }; Returns: boolean }
      is_enrollment_homeroom_teacher: {
        Args: { p_enrollment_id: string }
        Returns: boolean
      }
      is_enrollment_student: {
        Args: { p_enrollment_id: string }
        Returns: boolean
      }
      is_enrollment_teacher: {
        Args: { p_enrollment_id: string }
        Returns: boolean
      }
      valid_checkin_transcript: { Args: { value: Json }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
