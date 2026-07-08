export interface ProjectLike {
  [key: string]: unknown;
  name?: string | null;
  slug?: string | null;
  id?: string | number | null;
  url?: string | null;
  tasks?: number | null;
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
  next_payout_days?: number | null;
  next_payout_at?: string | null;
  next_payout_at_human?: string | null;
  next_payout_entries_count?: number | null;
  next_payout_entries?: Array<Record<string, unknown>>;
  pending_payout_entries?: Array<Record<string, unknown>>;
  next_payout_amount?: unknown;
  next_payout_source?: unknown;
  next_payout_confidence?: unknown;
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
