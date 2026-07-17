/** Stub — replace with real error capture in production SSR setup. */
let _lastError: unknown = null;

export function captureError(error: unknown): void {
  _lastError = error;
}

export function consumeLastCapturedError(): unknown {
  const e = _lastError;
  _lastError = null;
  return e;
}
