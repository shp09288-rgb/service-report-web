import type { CardRow } from '@/types/db'
import { FieldServiceContent, InstallationContent } from '@/types/report'

interface CardMeta {
  customer: string
  model: string
  sid: string
  eq_id: string
  location: string
}

function metaFromCard(card: CardRow): CardMeta {
  return {
    customer: card.customer,
    model:    card.model,
    sid:      card.sid,
    eq_id:    card.eq_id,
    location: card.location,
  }
}

export const defaultFieldServiceContent = (card?: CardRow): FieldServiceContent => {
  const meta = card ? metaFromCard(card) : { customer: '', model: '', sid: '', eq_id: '', location: '' }
  return {
    is_card_seeded: card != null,
    fse_name: '',
    report_date: '',
    customer: meta.customer,
    location: meta.location,
    crm_case_id: '',
    model: meta.model,
    site_survey: '',
    noise_level: '',
    main_user: '',
    sid: meta.sid,
    tel: '',
    eq_id: meta.eq_id,
    email: '',
    service_type: '',
    tool_status: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    end_time_note: '고객사 출문 시간',
    problem_statement: '',
    target_statement: '',
    daily_note: '',
    progress_pct: 0,
    critical_items: [{ text: '', sub_items: [''] }],
    data_location: '',
    work_completion: {
      type: '',
      reason: '',
      detail: '',
      time_log: '',
    },
    images: [],
  }
}

export const defaultInstallationContent = (card?: CardRow): InstallationContent => {
  const meta = card ? metaFromCard(card) : { customer: '', model: '', sid: '', eq_id: '', location: '' }
  return {
    is_card_seeded: card != null,
    fse_name: '',
    report_date: '',
    customer: meta.customer,
    location: meta.location,
    crm_case_id: '',
    model: meta.model,
    site_survey: '',
    noise_level: '',
    main_user: '',
    sid: meta.sid,
    tel: '',
    eq_id: meta.eq_id,
    email: '',
    est_complete_date: '',
    total_cycle_time: '',
    action_chart: [{ item: '', committed: '', actual_pct: 0 }],
    critical_items: [{ title: '', detail: '', next_plan: '' }],
    images: [],
  }
}
