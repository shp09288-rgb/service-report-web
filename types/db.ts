import type { FieldServiceContent, InstallationContent } from './report'

// ── Row types (what Supabase returns) ────────────────────────

export interface CardRow extends Record<string, unknown> {
  id: string
  type: 'field_service' | 'installation'
  // Master data fields (canonical — use these in all new code)
  customer: string
  model: string
  sid: string
  eq_id: string
  location: string
  // Deprecated — kept for DB compatibility until 0003_drop_deprecated_columns.sql
  site: string
  equipment: string
  created_at: string
  updated_at: string
}

export interface ImportSourceMeta {
  import_hash: string      // SHA-256 of file_name + '::' + sheet_name
  file_name: string
  sheet_name: string
  imported_at: string      // ISO timestamp
}

export interface DocumentRow extends Record<string, unknown> {
  id: string
  card_id: string
  report_date: string          // 'YYYY-MM-DD'
  is_external: boolean
  parent_document_id: string | null
  content: FieldServiceContent | InstallationContent
  source_meta: ImportSourceMeta | null
  created_at: string
  updated_at: string
}

export interface GanttRow extends Record<string, unknown> {
  id: string
  card_id: string
  payload: GanttPayload
  updated_at: string
}

export interface EditLockRow extends Record<string, unknown> {
  id: string
  card_id: string
  user_name: string
  acquired_at: string
  expires_at: string
}

export interface SettingsRow extends Record<string, unknown> {
  key: string
  value: string
}

// ── Gantt payload shape ───────────────────────────────────────

export interface GanttTask {
  no: number
  action: string
  category: string
  item: string
  remark: string
  status: string
  duration: number
  start_date: string   // 'YYYY-MM-DD'
  complete_date: string
}

export interface GanttPayload {
  tasks: GanttTask[]
}

// ── Insert types (omit server-generated fields) ───────────────

// New inserts supply the 5 master fields; site/equipment are legacy and omitted
export type CardInsert = Omit<CardRow, 'id' | 'created_at' | 'updated_at' | 'site' | 'equipment'>

export type DocumentInsert = Omit<DocumentRow, 'id' | 'created_at' | 'updated_at'>

export type GanttInsert = Omit<GanttRow, 'id' | 'updated_at'>

export type EditLockInsert = Omit<EditLockRow, 'id'>

/** Supabase client schema — tables exposed to PostgREST `public` */
export type Database = {
  public: {
    Tables: {
      cards: {
        Row: CardRow
        Insert: Omit<CardRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<CardRow>
        Relationships: []
      }
      documents: {
        Row: DocumentRow
        Insert: DocumentInsert
        Update: Partial<DocumentRow>
        Relationships: []
      }
      gantt: {
        Row: GanttRow
        Insert: GanttInsert
        Update: Partial<GanttRow>
        Relationships: []
      }
      edit_locks: {
        Row: EditLockRow
        Insert: EditLockInsert
        Update: Partial<EditLockRow>
        Relationships: []
      }
      settings: {
        Row: SettingsRow
        Insert: SettingsRow
        Update: Partial<SettingsRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
