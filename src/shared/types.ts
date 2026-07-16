export interface ProjectLike {
  [key: string]: unknown;
  name?: string | null;
  slug?: string | null;
  id?: string | number | null;
  url?: string | null;
  tasks?: number | null;
  auto_accept_priority?: boolean | null;
}

export interface ProjectSummary {
  count: number;
  total_tasks: number;
}

export interface ProjectDelta {
  slug: string;
  id: string | null;
  name: string;
  url: string | null;
  previous_tasks: number;
  current_tasks: number;
  added_tasks: number;
}

export interface AutoAcceptProjectPreference {
  project_id: string;
  enabled: boolean;
  last_seen_name: string | null;
  last_seen_slug: string | null;
  last_seen_url: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface AutoAcceptProjectPreferenceStore {
  version: number;
  projects: Record<string, AutoAcceptProjectPreference>;
  updated_at: string | null;
}

export interface FilteredProjectsResult<T extends ProjectLike = ProjectLike> {
  projects: T[];
  excludedProjects: T[];
}

export interface PaymentSnapshot {
  [key: string]: unknown;
  available_amount?: number | null;
  available_amount_cents?: number | null;
  available_amount_formatted?: string | null;
  can_withdraw?: boolean | null;
  button_enabled?: boolean | null;
  button_text?: string | null;
  withdraw_button_present?: boolean | null;
  withdraw_button_text?: string | null;
  withdraw_button_count?: number | null;
  withdraw_button_disabled?: boolean | null;
  next_withdrawal_at?: string | null;
  next_withdrawal_text?: string | null;
  next_withdrawal_source?: string | null;
  next_withdrawal_amount_cents?: number | null;
  next_withdrawal_amount?: unknown;
  next_withdrawal_amount_formatted?: string | null;
  last_payout_amount_cents?: number | null;
  last_payout_amount?: unknown;
  last_payout_amount_formatted?: string | null;
  next_payout_days?: number | null;
  next_payout_at?: string | null;
  next_payout_at_human?: string | null;
  next_payout_entries_count?: number | null;
  next_payout_entries?: PublicPayoutEntry[];
  pending_payout_entries?: RawPayoutEntry[];
  funds_history_complete?: boolean | null;
  next_payout_amount?: unknown;
  next_payout_source?: unknown;
  next_payout_confidence?: unknown;
  pending_payout_entries_public?: PublicPayoutEntry[];
  next_payout_entries_public?: PublicPayoutEntry[];
}

export interface RawPayoutEntry {
  project?: string | null;
  kind?: 'hourly' | 'task' | string | null;
  status?: 'pending' | 'paid' | string | null;
  amount?: string | null;
  amount_cents?: number | null;
  duration?: string | null;
  relative_age_value?: number | null;
  relative_age_unit?: 'minute' | 'hour' | 'day' | 'week' | string | null;
  relative_age_text?: string | null;
  days_ago?: number | null;
  days_until_available?: number | null;
  entry_date?: string | null;
  due_days?: number | null;
  estimated_work_at?: string | null;
  estimated_payout_at?: string | null;
  estimate_source?: 'observed_minutes' | 'observed_hours' | 'row_date_fallback' | 'current_time_fallback' | string | null;
  estimate_confidence?: 'high' | 'low' | string | null;
  fingerprint?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

export interface PublicPayoutEntry {
  project?: string | null;
  kind?: 'hourly' | 'task' | string | null;
  amount?: string | null;
  relative_age?: string | null;
  estimated_work_at?: string | null;
  estimated_payout_at?: string | null;
  source?: string | null;
  confidence?: string | null;
}

export interface FundsHistoryObservationEntry extends RawPayoutEntry {
  fingerprint: string;
  status: 'pending' | 'paid' | string;
  amount_cents: number;
  relative_age_value: number;
  relative_age_unit: string | null;
  days_until_available: number;
  due_days: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  estimated_work_at: string | null;
  estimated_payout_at: string | null;
  estimate_source: string | null;
  estimate_confidence: string | null;
}

export interface FundsHistoryObservationStore {
  version: number;
  entries: Record<string, FundsHistoryObservationEntry>;
  updated_at: string | null;
}


export interface CurrencyState {
  convert_to_php: boolean;
  usd_php_rate: number | null;
  usd_php_rate_date: string | null;
  usd_php_rate_fetched_at: string | null;
  usd_php_rate_source: string | null;
}

export interface LoggerLike {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warning: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
