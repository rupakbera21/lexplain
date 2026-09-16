// ============================================================
// lib/ratelimit.ts — Distributed rate limiting via Upstash Redis
//
// Limits to RATE_LIMIT_RPM requests per minute per IP address.
// Uses Upstash Ratelimit with a sliding window algorithm and an
// ephemeral in-memory cache for warm lambda efficiency.
// Fails open gracefully if Redis is unavailable or unconfigured.
// ============================================================

import { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/types";

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_RPM ?? "20", 10);

let ratelimitInstance: Ratelimit | null = null;
let isInitialized = false;

export function getRatelimit(): Ratelimit | null {
  if (isInitialized) return ratelimitInstance;
  isInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/^["']|["']$/g, "").trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.replace(/^["']|["']$/g, "").trim();

  if (!url || !token) {
    console.warn(
      "[Lexplain:RateLimit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not configured. Rate limiting is running in fail-open mode."
    );
    return null;
  }

  try {
    const redis = new Redis({ url, token });
    ratelimitInstance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(MAX_REQUESTS, "60 s"),
      ephemeralCache: new Map(),
      prefix: "lexplain:ratelimit",
    });
    return ratelimitInstance;
  } catch (err) {
    console.error("[Lexplain:RateLimit] Failed to initialize Upstash Redis client:", err);
    return null;
  }
}

export function resetRatelimitInstanceForTesting(): void {
  ratelimitInstance = null;
  isInitialized = false;
}

/**
 * Gets the client IP from the request headers.
 * Works behind Vercel's proxy (x-forwarded-for).
 */
export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Checks if the request should be rate-limited.
 * Returns null if allowed, or an ApiError if rate limit exceeded.
 * Fails open (returns null) on Redis connection error to avoid blocking users.
 */
export async function checkRateLimit(req: NextRequest): Promise<ApiError | null> {
  const limiter = getRatelimit();
  if (!limiter) {
    // Fail open if credentials are not configured
    return null;
  }

  const ip = getClientIP(req);

  try {
    const { success, reset } = await limiter.limit(ip);

    if (!success) {
      const resetIn = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return {
        error: `Rate limit exceeded. Please wait ${resetIn} seconds before trying again.`,
        errorType: "RATE_LIMIT",
        retryable: true,
      };
    }

    return null;
  } catch (err) {
    console.error("[Lexplain:RateLimit] Rate limit check failed, failing open:", err);
    return null;
  }
}
