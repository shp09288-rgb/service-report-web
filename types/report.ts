export interface CriticalItem {
  text: string
  sub_items: string[]
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
  est_complete_date: string
  total_cycle_time: string
  action_chart: { item: string; committed: string; actual_pct: number }[]
  critical_items: { title: string; detail: string; next_plan: string }[]
  images: ImageRef[]
}
