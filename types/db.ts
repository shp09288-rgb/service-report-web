import type { FieldServiceContent, InstallationContent } from './report'

// ── Row types (what Supabase returns) ────────────────────────

export interface CardRow {
  id: string
  type: 'field_service' | 'installation'
  site: string
  equipment: string
  created_at: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  card_id: string
  report_date: string          // 'YYYY-MM-DD'
  is_external: boolean
  parent_document_id: string | null
  content: FieldServiceContent | InstallationContent
  created_at: string
  updated_at: string
}

export interface GanttRow {
  id: string
  card_id: string
  payload: GanttPayload
  updated_at: string
}

export interface EditLockRow {
  id: string
  card_id: string
  user_name: string
  acquired_at: string
  expires_at: string
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

export type CardInsert = Omit<CardRow, 'id' | 'created_at' | 'updated_at'>

export type DocumentInsert = Omit<DocumentRow, 'id' | 'created_at' | 'updated_at'>

export type GanttInsert = Omit<GanttRow, 'id' | 'updated_at'>

export type EditLockInsert = Omit<EditLockRow, 'id'>
