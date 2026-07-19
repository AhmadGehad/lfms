import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function resolveLogLevel(raw = process.env.LOG_LEVEL): LogLevel {
  if (!raw) return process.env.NODE_ENV === "production" ? "info" : "debug";
  const normalized = raw.toLowerCase();
  if (normalized in LOG_LEVEL_ORDER) return normalized as LogLevel;
  throw new Error("LOG_LEVEL must be debug, info, warn, or error");
}

type LogContext = {
  requestId?: string;
  companyId?: number | null;
  farmId?: number | null;
  actorId?: string | number | null;
};

type LogRecord = LogFields & {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
};

const contextStorage = new AsyncLocalStorage<LogContext>();
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PARTS = [
  "authorization",
  "cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "session",
  "credential",
] as const;

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[-_\s]/g, "").toLowerCase();
  return SENSITIVE_KEY_PARTS.some(part => normalized.includes(part));
}

function sanitizeString(value: string) {
  return value
    .replace(/:\/\/[^@\s/]+@/g, "://[REDACTED]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /(authorization|cookie|password|passwd|secret|token|api[-_\s]?key|credential)\s*[:=]\s*([^\s,;]+)/gi,
      "$1=[REDACTED]",
    );
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: process.env.NODE_ENV === "production"
        ? undefined
        : value.stack && sanitizeString(value.stack),
    };
  }
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(item => sanitize(item, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";

  seen.add(value);
  const result: LogFields = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : sanitize(nested, seen);
  }
  return result;
}

export function redactLogFields(fields: LogFields): LogFields {
  return sanitize(fields) as LogFields;
}

export function withLogContext<T>(context: LogContext, callback: () => T): T {
  return contextStorage.run(context, callback);
}

export class StructuredLogger {
  constructor(
    private readonly service: string,
    private readonly bindings: LogFields = {},
    private readonly sink: (record: LogRecord) => void = record => {
      const line = JSON.stringify(record);
      if (record.level === "error") console.error(line);
      else if (record.level === "warn") console.warn(line);
      else console.log(line);
    },
    private readonly minimumLevel: LogLevel = resolveLogLevel(),
  ) {}

  child(bindings: LogFields): StructuredLogger {
    return new StructuredLogger(
      this.service,
      { ...this.bindings, ...bindings },
      this.sink,
      this.minimumLevel,
    );
  }

  debug(message: string, fields: LogFields = {}) { this.write("debug", message, fields); }
  info(message: string, fields: LogFields = {}) { this.write("info", message, fields); }
  warn(message: string, fields: LogFields = {}) { this.write("warn", message, fields); }
  error(message: string, fields: LogFields = {}) { this.write("error", message, fields); }

  private write(level: LogLevel, message: string, fields: LogFields) {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minimumLevel]) return;
    const record = redactLogFields({
      ...this.bindings,
      ...contextStorage.getStore(),
      ...fields,
    });
    this.sink({
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      ...record,
    });
  }
}

export const logger = new StructuredLogger(
  "lfms",
  process.env.DEPLOY_VERSION
    ? { deployVersion: process.env.DEPLOY_VERSION }
    : {},
);
