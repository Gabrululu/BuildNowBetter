/**
 * Thrown by route handlers to produce a deliberate status + client-readable message. Anything
 * else that escapes a handler is a bug and becomes a generic 500 (see errorHandler.ts) — the
 * attendee's phone must never receive a stack trace.
 */
export class RelayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}
