import type { LoggerLike } from './types';

const LEVELS = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
} as const;

type LevelKey = keyof typeof LEVELS;

export function createLogger(level: string): LoggerLike {
  const threshold = LEVELS[String(level || 'info').toLowerCase() as LevelKey] ?? LEVELS.info;

  const withTimestamp = (levelLabel: string, method: (...args: unknown[]) => void, minLevel: number) => (...args: unknown[]) => {
    if (threshold <= minLevel) {
      method(`[${formatLogTimestamp(new Date())}] ${levelLabel}`, ...args);
    }
  };

  return {
    debug: withTimestamp('[DEBUG]', console.log, LEVELS.debug),
    info: withTimestamp('[INFO]', console.log, LEVELS.info),
    warning: withTimestamp('[WARN]', console.warn, LEVELS.warning),
    error: withTimestamp('[ERROR]', console.error, LEVELS.error),
  };
}

function formatLogTimestamp(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const timeZone = get('timeZoneName') || 'local';

  return `${year}-${month}-${day} ${hour}:${minute}:${second} ${timeZone}`;
}
