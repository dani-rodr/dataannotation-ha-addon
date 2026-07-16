export const DEFAULT_POLL_CRON = '*/5 * * * *';
export const DEFAULT_FAST_POLL_CRON = '*/5 * * * * *';
export const DEFAULT_FUNDS_HISTORY_CRON = '*/30 * * * *';
export const MINIMUM_INTERVAL_SECONDS = 5;

export function normalizePollingCron(value: unknown, fallback = DEFAULT_POLL_CRON): string {
  const schedule = String(value || fallback).trim();
  validatePollingCron(schedule);
  return schedule;
}

export function validatePollingCron(schedule: string): void {
  const seconds = getPollingCronIntervalSeconds(schedule);
  if (seconds < MINIMUM_INTERVAL_SECONDS) {
    throw new Error(`Polling cron must be at least ${MINIMUM_INTERVAL_SECONDS} seconds; received "${schedule}"`);
  }
}

export function getPollingCronIntervalSeconds(schedule: string): number {
  const fields = String(schedule || '').trim().split(/\s+/);
  if (fields.length === 5) {
    assertSimpleCron(fields, 5);
    return stepToSeconds(fields[0], 60);
  }

  if (fields.length === 6) {
    assertSimpleCron(fields, 6);
    return stepToSeconds(fields[0], 1);
  }

  throw new Error(`Unsupported cron schedule "${schedule}". Use a simple pattern like "*/5 * * * *" or "*/30 * * * * *".`);
}

export function computeNextRunAt(schedule: string, from: Date = new Date()): string | null {
  const date = normalizeDate(from);
  if (!date) {
    return null;
  }

  const fields = String(schedule || '').trim().split(/\s+/);
  if (fields.length === 5) {
    assertSimpleCron(fields, 5);
    const stepMinutes = stepToSeconds(fields[0], 60) / 60;
    return nextMinuteBoundary(date, stepMinutes).toISOString();
  }

  if (fields.length === 6) {
    assertSimpleCron(fields, 6);
    const stepSeconds = stepToSeconds(fields[0], 1);
    return nextSecondBoundary(date, stepSeconds).toISOString();
  }

  throw new Error(`Unsupported cron schedule "${schedule}". Use a simple pattern like "*/5 * * * *" or "*/30 * * * * *".`);
}

function assertSimpleCron(fields: string[], expectedLength: number): void {
  if (fields.length !== expectedLength) {
    throw new Error(`Unsupported cron schedule. Expected ${expectedLength} fields.`);
  }

  for (let index = 1; index < fields.length; index += 1) {
    if (fields[index] !== '*') {
      throw new Error(`Unsupported cron schedule "${fields.join(' ')}". Only step-based schedules with wildcard trailing fields are supported.`);
    }
  }
}

function stepToSeconds(field: string, unitSeconds: number): number {
  if (field === '*') {
    return unitSeconds;
  }

  const match = String(field).match(/^\*\/(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported cron step "${field}". Use "*" or "*/N".`);
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Unsupported cron step "${field}". Use "*" or "*/N".`);
  }

  return value * unitSeconds;
}

function nextMinuteBoundary(date: Date, stepMinutes: number): Date {
  const currentMinute = date.getMinutes();
  const currentHour = date.getHours();
  const currentSecond = date.getSeconds();
  const currentMs = date.getMilliseconds();
  const elapsedUnits = Math.floor(currentMinute / stepMinutes) + 1;
  const totalMinutes = elapsedUnits * stepMinutes;
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(totalMinutes);

  if (currentSecond === 0 && currentMs === 0 && currentMinute % stepMinutes === 0 && next.getHours() === currentHour && next.getMinutes() === currentMinute) {
    next.setMinutes(next.getMinutes() + stepMinutes);
  }

  return next;
}

function nextSecondBoundary(date: Date, stepSeconds: number): Date {
  const currentSecond = date.getSeconds();
  const currentMs = date.getMilliseconds();
  const elapsedUnits = Math.floor(currentSecond / stepSeconds) + 1;
  const totalSeconds = elapsedUnits * stepSeconds;
  const next = new Date(date);
  next.setMilliseconds(0);
  next.setSeconds(totalSeconds);

  if (currentSecond % stepSeconds === 0 && currentMs === 0 && next.getSeconds() === currentSecond) {
    next.setSeconds(next.getSeconds() + stepSeconds);
  }

  return next;
}

function normalizeDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
