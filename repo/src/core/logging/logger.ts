type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogCategory =
  | 'auth'
  | 'merchant'
  | 'orgAdmin'
  | 'permissions'
  | 'storage'
  | 'booking'
  | 'recruiting'
  | 'recovery'
  | 'importExport'
  | 'audit'
  | 'app';

const SENSITIVE_KEYS = ['password', 'ssn', 'compensation', 'passwordHash', 'keyMaterial', 'salt'];

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const shouldRedact = SENSITIVE_KEYS.some((sensitiveKey) =>
          key.toLowerCase().includes(sensitiveKey.toLowerCase())
        );

        return [key, shouldRedact ? '[REDACTED]' : redactValue(item)];
      })
    );
  }

  return value;
}

function write(level: LogLevel, category: LogCategory, message: string, context?: unknown): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    context: context ? redactValue(context) : undefined
  };

  // eslint-disable-next-line no-console
  console[level](`[${category}] ${message}`, payload);
}

export const logger = {
  debug: (category: LogCategory, message: string, context?: unknown) =>
    write('debug', category, message, context),
  info: (category: LogCategory, message: string, context?: unknown) =>
    write('info', category, message, context),
  warn: (category: LogCategory, message: string, context?: unknown) =>
    write('warn', category, message, context),
  error: (category: LogCategory, message: string, context?: unknown) =>
    write('error', category, message, context)
};
