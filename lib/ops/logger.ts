/**
 * Structured JSON logger for Mimir worker agents.
 *
 * Ensures errors, money inputs, and secrets are handled uniformly and safely.
 * Produces deterministic JSON output to stdout/stderr.
 */

const REDACTED_KEYS = new Set([
  "secret",
  "credential",
  "key",
  "token",
  "password",
  "authorization",
  "private_key",
]);

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  for (const redacted of REDACTED_KEYS) {
    if (k.includes(redacted)) return true;
  }
  return false;
}

function scrub(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (seen.has(obj)) return "[CIRCULAR]";
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((i) => scrub(i, seen));
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSecretKey(k)) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = scrub(v, seen);
    }
  }
  return result;
}

export function serializeError(err: unknown): any {
  if (err instanceof Error) {
    const base = {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
    // Include custom properties that might be on the error
    const scrubbedProps = scrub({ ...err });
    return { ...base, ...scrubbedProps };
  }
  return err;
}

export class StructuredLogger {
  constructor(public readonly worker: string) {}

  private write(level: "info" | "warn" | "error", msg: string | null | undefined, context?: Record<string, unknown>) {
    const payload: any = {
      timestamp: new Date().toISOString(),
      worker: this.worker,
      level,
      msg: msg ?? "",
    };

    if (context) {
      const safeContext = { ...context };
      if ("error" in safeContext) {
        safeContext.error = serializeError(safeContext.error);
      }
      payload.context = scrub(safeContext);
    }
    
    const out = JSON.stringify(payload);
    if (level === "error") {
      console.error(out);
    } else if (level === "warn") {
      console.warn(out);
    } else {
      console.log(out);
    }
  }

  info(msg: string | null | undefined, context?: Record<string, unknown>) {
    this.write("info", msg, context);
  }

  warn(msg: string | null | undefined, context?: Record<string, unknown>) {
    this.write("warn", msg, context);
  }

  error(msg: string | null | undefined, context?: Record<string, unknown>) {
    this.write("error", msg, context);
  }
}

export function createWorkerLogger(worker: string) {
  return new StructuredLogger(worker);
}
