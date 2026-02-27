import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

/** Structured dev-friendly format: [timestamp] LEVEL [context] message */
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ timestamp, level, message, context, ...rest }) => {
    const ctx = context ? ` [${context}]` : '';
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `[${timestamp}] ${level}${ctx} ${message}${extra}`;
  }),
);

/** Production format: structured JSON with label */
const prodFormat = combine(
  timestamp(),
  json(),
);

export interface LoggerConfig {
  level: string;
  consoleEnabled: boolean;
  json: boolean;
}

const defaultConfig: LoggerConfig = {
  level: 'info',
  consoleEnabled: true,
  json: false,
};

let loggerInstance: winston.Logger | null = null;

/** Create or return the singleton logger */
export function createLogger(config: Partial<LoggerConfig> = {}): winston.Logger {
  if (loggerInstance) return loggerInstance;

  const cfg = { ...defaultConfig, ...config };

  loggerInstance = winston.createLogger({
    level: cfg.level,
    format: cfg.json ? prodFormat : devFormat,
    transports: [
      new winston.transports.Console({
        silent: !cfg.consoleEnabled,
      }),
    ],
  });

  return loggerInstance;
}

/** Get the existing logger (creates with defaults if not yet initialized) */
export function getLogger(): winston.Logger {
  if (!loggerInstance) return createLogger();
  return loggerInstance;
}
