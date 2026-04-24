export interface NoteImage {
  key: string
  data_url: string   // base64 data URI — embeddable into DOCX
  caption: string
  width?: number     // natural pixel width
  height?: number    // natural pixel height
}

export interface CriticalItem {
  title: string
  note: string
  progress_pct: number
  note_images: NoteImage[]
}

export interface WorkCompletion {
  type: string   // 사무실 복귀 | 재택근무 전환 | 추가 업무 수행 | 업무 종료
  reason: string
  detail: string
  time_log: string
}

export interface ImageRef {
  key: string
  url: string
  caption: string
}

export interface FieldServiceContent {
  // When true, customer/model/sid/eq_id/location were seeded from card master
  // data at creation time and must be treated as read-only in the editor.
  // Absent (undefined) on all documents created before this flag was introduced.
  is_card_seeded?: boolean
  fse_name: string
  report_date: string
  customer: string
  location: string
  crm_case_id: string
  model: string
  site_survey: string
  noise_level: string
  main_user: string
  sid: string
  tel: string
  eq_id: string
  email: string
  service_type: string
  tool_status: string
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  end_time_note: string
  problem_statement: string
  target_statement: string
  daily_note: string
  progress_pct: number
  critical_items: CriticalItem[]
  data_location: string
  work_completion: WorkCompletion
  images: ImageRef[]
}

export interface InstallationContent {
  is_card_seeded?: boolean

  // Header
  fse_name: string
  report_date: string

  // System Information
  customer: string
  model: string
  sid: string
  eq_id: string

  // Installation Information
  location: string
  site_survey: string
  noise_level: string
  start_date: string
  est_complete_date: string

  // Service session info
  service_type: string
  start_time: string
  end_time: string

  // Contact Info
  crm_case_id: string
  main_user: string
  tel: string
  email: string

  // Total Cycle Time
  committed_pct: number   // 0–100
  actual_pct: number      // 0–100
  total_days: number
  progress_days: number

  // Individual Action Chart
  action_chart: { item: string; committed: string; actual_pct: number }[]

  // Critical Item Summary (single text block)
  critical_item_summary: string

  // Detail Report (numbered items)
  detail_report: { title: string; content: string }[]

  // Next Plan (single text block)
  next_plan: string

  // Data Location
  data_location: string
}
