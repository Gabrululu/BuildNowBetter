import type { ErrorRequestHandler, RequestHandler } from "express";
import { BaseError } from "viem";

import { RelayError } from "./httpError.js";

/**
 * Terminal error middleware. Without it, Express 5 answers a thrown handler with an HTML page
 * that embeds `err.stack` whenever NODE_ENV !== "production" — leaking the RPC URL and repo
 * paths — and the frontend's `response.json()` blows up on the HTML before it can read the
 * status. Every failure now leaves here as `{ error: string }`.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    res.end();
    return;
  }

  if (error instanceof RelayError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  // Malformed JSON body, raised by express.json() before any handler runs.
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "request body is not valid JSON" });
    return;
  }

  // RPC unreachable, gas estimation failure, contract revert on simulation, etc. The detail is
  // useful in the relay's own logs but means nothing on an attendee's phone.
  if (error instanceof BaseError) {
    console.error("[relay] chain error:", error.shortMessage, error.details ?? "");
    res.status(502).json({ error: "the chain call failed, try again in a moment" });
    return;
  }

  console.error("[relay] unhandled error:", error);
  res.status(500).json({ error: "internal relay error" });
};

/** 404 for unknown paths, so those also answer JSON instead of Express' HTML default. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "unknown endpoint" });
};
