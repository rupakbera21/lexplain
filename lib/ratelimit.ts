// ============================================================
// lib/ratelimit.ts — In-memory rate limiting for API routes
//
// Limits to RATE_LIMIT_RPM requests per minute per IP address.
// Uses a sliding-window algorithm. No external services needed.
// ============================================================

import { NextRequest } from "next/server";
import { ApiError } from "@/types";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_RPM ?? "20", 10);

// In-memory store: IP → list of request timestamps
const requestLog = new Map<string, number[]>();

// Clean up old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog.entries()) {
    const valid = timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, valid);
    }
  }
}, 5 * 60 * 1000);

/**
 * Gets the client IP from the request headers.
 * Works behind Vercel's proxy (x-forwarded-for).
 */
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Checks if the request should be rate-limited.
 * Returns null if allowed, or an ApiError if rate limit exceeded.
 */
export function checkRateLimit(req: NextRequest): ApiError | null {
  const ip = getClientIP(req);
  const now = Date.now();

  const existing = requestLog.get(ip) ?? [];
  const windowStart = now - WINDOW_MS;
  const inWindow = existing.filter((t) => t > windowStart);

  if (inWindow.length >= MAX_REQUESTS) {
    const oldestInWindow = Math.min(...inWindow);
    const resetIn = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    return {
      error: `Rate limit exceeded. Please wait ${resetIn} seconds before trying again.`,
      errorType: "RATE_LIMIT",
      retryable: true,
    };
  }

  inWindow.push(now);
  requestLog.set(ip, inWindow);
  return null;
}
