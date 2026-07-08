const fs = require('fs');
const path = require('path');

const CURRENCY_BASE = 'USD';
const CURRENCY_QUOTE = 'PHP';
const DEFAULT_CONVERT_TO_PHP = false;
const FRANKFURTER_RATE_URL = 'https://api.frankfurter.dev/v2/rate/USD/PHP';

function loadCurrencyState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return defaultCurrencyState();
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeCurrencyState(payload);
  } catch {
    return defaultCurrencyState();
  }
}

function saveCurrencyState(filePath, state) {
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeCurrencyState(state), null, 2));
}

function defaultCurrencyState() {
  return {
    convert_to_php: DEFAULT_CONVERT_TO_PHP,
    usd_php_rate: null,
    usd_php_rate_date: null,
    usd_php_rate_fetched_at: null,
    usd_php_rate_source: null,
  };
}

function normalizeCurrencyState(value) {
  const base = defaultCurrencyState();
  const payload = value && typeof value === 'object' ? value : {};

  return {
    ...base,
    convert_to_php: normalizeBoolean(payload.convert_to_php ?? payload.convertToPhp ?? payload.enabled ?? payload.value ?? payload.state),
    usd_php_rate: normalizeRate(payload.usd_php_rate ?? payload.usdPhpRate ?? payload.rate),
    usd_php_rate_date: normalizeText(payload.usd_php_rate_date ?? payload.usdPhpRateDate ?? payload.date),
    usd_php_rate_fetched_at: normalizeIsoDate(payload.usd_php_rate_fetched_at ?? payload.usdPhpRateFetchedAt ?? payload.fetched_at),
    usd_php_rate_source: normalizeText(payload.usd_php_rate_source ?? payload.usdPhpRateSource ?? payload.source),
  };
}

function shouldRefreshCurrencyRate(state, now = new Date()) {
  const current = normalizeDate(now) || new Date();
  const currentUtcDate = utcDateString(current);
  const threshold = nextFxRateRefreshWindow(current);

  if (!Number.isFinite(Number(state?.usd_php_rate)) || !state?.usd_php_rate_date) {
    return true;
  }

  if (current < threshold) {
    return false;
  }

  return state.usd_php_rate_date !== currentUtcDate;
}

function computeNextFxRateRefreshAt(now = new Date()) {
  const current = normalizeDate(now) || new Date();
  const threshold = nextFxRateRefreshWindow(current);
  if (current < threshold) {
    return threshold.toISOString();
  }

  return new Date(threshold.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function nextFxRateRefreshWindow(now = new Date()) {
  const current = normalizeDate(now) || new Date();
  const threshold = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
    15,
    30,
    0,
    0
  ));

  return threshold;
}

async function fetchUsdToPhpRate() {
  const response = await fetch(FRANKFURTER_RATE_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Frankfurter rate request failed with ${response.status}`);
  }

  const payload = await response.json();
  const rate = normalizeRate(payload?.rate);
  if (!Number.isFinite(rate)) {
    throw new Error('Frankfurter rate response missing numeric rate');
  }

  return {
    base: normalizeText(payload?.base) || CURRENCY_BASE,
    quote: normalizeText(payload?.quote) || CURRENCY_QUOTE,
    rate,
    date: normalizeText(payload?.date) || null,
    source: 'frankfurter',
    fetched_at: new Date().toISOString(),
  };
}

function convertProjectsForCurrency(projects, currencyState) {
  return (Array.isArray(projects) ? projects : []).map((project) => convertProjectForCurrency(project, currencyState));
}

function convertProjectForCurrency(project, currencyState) {
  const displayCurrency = getDisplayCurrency(currencyState);
  const rate = getExchangeRate(currencyState);

  return {
    ...(project || {}),
    currency: displayCurrency,
    exchange_rate: rate,
    base_currency: CURRENCY_BASE,
    pay: convertMoneyText(project?.pay, rate, displayCurrency),
    base_pay: convertMoneyText(project?.base_pay, rate, displayCurrency),
    priority_pay: convertMoneyText(project?.priority_pay, rate, displayCurrency),
  };
}

function convertPaymentsForCurrency(payments, currencyState) {
  const displayCurrency = getDisplayCurrency(currencyState);
  const rate = getExchangeRate(currencyState);

  return convertPaymentsInternal(payments, displayCurrency, rate);
}

function convertPaymentsInternal(payments, displayCurrency, rate) {
  const converted = { ...(payments || {}) };
  const moneyFields = [
    'available_amount',
    'total_earnings',
    'total_paid_out',
    'this_month',
    'best_month',
    'pending_approval',
  ];

  for (const field of moneyFields) {
    converted[field] = convertMoneyNumber(converted[field], rate);
  }

  converted.next_payout_amount = convertMoneyValue(converted.next_payout_amount, rate, displayCurrency);

  converted.available_amount_cents = convertCents(converted.available_amount_cents, rate);
  converted.total_earnings_cents = convertCents(converted.total_earnings_cents, rate);
  converted.total_paid_out_cents = convertCents(converted.total_paid_out_cents, rate);
  converted.this_month_cents = convertCents(converted.this_month_cents, rate);
  converted.best_month_cents = convertCents(converted.best_month_cents, rate);
  converted.pending_approval_cents = convertCents(converted.pending_approval_cents, rate);

  converted.available_amount_formatted = convertMoneyText(converted.available_amount_formatted, rate, displayCurrency);
  converted.total_earnings_formatted = convertMoneyText(converted.total_earnings_formatted, rate, displayCurrency);
  converted.total_paid_out_formatted = convertMoneyText(converted.total_paid_out_formatted, rate, displayCurrency);
  converted.this_month_formatted = convertMoneyText(converted.this_month_formatted, rate, displayCurrency);
  converted.best_month_formatted = convertMoneyText(converted.best_month_formatted, rate, displayCurrency);
  converted.pending_approval_formatted = convertMoneyText(converted.pending_approval_formatted, rate, displayCurrency);
  converted.button_text = convertButtonText(converted.button_text, rate, displayCurrency);
  converted.withdraw_button_text = convertButtonText(converted.withdraw_button_text, rate, displayCurrency);

  converted.next_payout_entries = convertPayoutEntries(converted.next_payout_entries, rate, displayCurrency);
  converted.pending_payout_entries = convertPayoutEntries(converted.pending_payout_entries, rate, displayCurrency);

  converted.currency = displayCurrency;
  converted.exchange_rate = rate;
  converted.base_currency = CURRENCY_BASE;
  converted.quote_currency = displayCurrency;

  return converted;
}

function convertPayoutEntries(entries, rate, displayCurrency) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...(entry || {}),
    amount: convertMoneyText(entry?.amount, rate, displayCurrency),
    amount_cents: convertCents(entry?.amount_cents, rate),
  }));
}

function convertMoneyNumber(value, rate) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value ?? null;
  }

  return roundToCents(amount * getExchangeRateValue(rate));
}

function convertCents(value, rate) {
  const cents = Number(value);
  if (!Number.isFinite(cents)) {
    return value ?? null;
  }

  return Math.round(cents * getExchangeRateValue(rate));
}

function convertMoneyText(value, rate, currencyCode) {
  const parsed = parseMoneyText(value);
  if (!parsed) {
    return value ?? null;
  }

  if (currencyCode === CURRENCY_BASE) {
    return value;
  }

  const converted = roundToCents(parsed.amount * getExchangeRateValue(rate));
  return `${currencyCode} ${formatNumber(converted)}${parsed.suffix}`;
}

function convertMoneyValue(value, rate, currencyCode) {
  if (currencyCode === CURRENCY_BASE) {
    return value;
  }

  if (typeof value === 'string') {
    return convertMoneyText(value, rate, currencyCode);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return roundToCents(value * getExchangeRateValue(rate));
  }

  return value ?? null;
}

function convertButtonText(value, rate, currencyCode) {
  if (currencyCode === CURRENCY_BASE || typeof value !== 'string') {
    return value ?? null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  const match = normalized.match(/^Get paid\s+\$([\d,]+(?:\.\d{2})?)$/i);
  if (!match) {
    return convertMoneyText(value, rate, currencyCode);
  }

  const converted = roundToCents(Number(match[1].replace(/,/g, '')) * getExchangeRateValue(rate));
  return `Get paid ${currencyCode} ${formatNumber(converted)}`;
}

function parseMoneyText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { amount: value, suffix: '' };
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  const match = normalized.match(/^(?:\$|PHP\s*)([\d,]+(?:\.\d{2})?)(.*)$/i);
  if (!match) {
    return null;
  }

  return {
    amount: Number(match[1].replace(/,/g, '')),
    suffix: match[2] || '',
  };
}

function getDisplayCurrency(currencyState) {
  return Boolean(currencyState?.convert_to_php) && Number.isFinite(Number(currencyState?.usd_php_rate)) && Number(currencyState.usd_php_rate) > 0
    ? CURRENCY_QUOTE
    : CURRENCY_BASE;
}

function getExchangeRate(currencyState) {
  return Boolean(currencyState?.convert_to_php) && Number.isFinite(Number(currencyState?.usd_php_rate)) && Number(currencyState.usd_php_rate) > 0
    ? getExchangeRateValue(currencyState?.usd_php_rate)
    : 1;
}

function getExchangeRateValue(rate) {
  const parsed = Number(rate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roundToCents(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['on', 'true', 'enabled', 'enable', '1', 'php'].includes(normalized)) {
      return true;
    }
    if (['off', 'false', 'disabled', 'disable', '0', 'usd'].includes(normalized)) {
      return false;
    }
  }

  return DEFAULT_CONVERT_TO_PHP;
}

function normalizeRate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

function normalizeIsoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDateString(date) {
  const current = normalizeDate(date) || new Date();
  return current.toISOString().slice(0, 10);
}

module.exports = {
  CURRENCY_BASE,
  CURRENCY_QUOTE,
  DEFAULT_CONVERT_TO_PHP,
  FRANKFURTER_RATE_URL,
  computeNextFxRateRefreshAt,
  convertPaymentsForCurrency,
  convertProjectForCurrency,
  convertProjectsForCurrency,
  fetchUsdToPhpRate,
  getDisplayCurrency,
  loadCurrencyState,
  normalizeCurrencyState,
  saveCurrencyState,
  shouldRefreshCurrencyRate,
  convertMoneyValue,
};
