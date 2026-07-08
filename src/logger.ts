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
      method(`[${new Date().toISOString()}] ${levelLabel}`, ...args);
    }
  };

  return {
    debug: withTimestamp('[DEBUG]', console.log, LEVELS.debug),
    info: withTimestamp('[INFO]', console.log, LEVELS.info),
    warning: withTimestamp('[WARN]', console.warn, LEVELS.warning),
    error: withTimestamp('[ERROR]', console.error, LEVELS.error),
  };
}
