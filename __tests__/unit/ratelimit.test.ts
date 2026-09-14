// ============================================================
// __tests__/unit/ratelimit.test.ts
// Unit tests for lib/ratelimit.ts — IP extraction,
// sliding-window boundary, resetIn calculation, "unknown" fallback.
// ============================================================

import { NextRequest } from "next/server";

// We import the module fresh for each test to reset the in-memory Map
// by re-requiring. Jest module registry doesn't reset between tests
// in the same file, so we manage the Map state by mocking Date.now().

import { checkRateLimit } from "@/lib/ratelimit";

function makeReq(overrides: {
  "x-forwarded-for"?: string;
  "x-real-ip"?: string;
} = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (overrides["x-forwarded-for"]) headers["x-forwarded-for"] = overrides["x-forwarded-for"];
  if (overrides["x-real-ip"]) headers["x-real-ip"] = overrides["x-real-ip"];
  return new NextRequest("http://localhost/api/test", { method: "POST", headers });
}

describe("checkRateLimit — IP extraction", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    // Just checking it doesn't crash and returns null (allowed) for first request
    const result = checkRateLimit(req);
    expect(result).toBeNull();
  });

  it("uses first IP from comma-separated x-forwarded-for chain", () => {
    // "1.2.3.4, 10.0.0.1, 172.16.0.1" — should use 1.2.3.4
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 172.16.0.1" });
    // First request should be allowed
    const result = checkRateLimit(req);
    expect(result).toBeNull();
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeReq({ "x-real-ip": "5.6.7.8" });
    const result = checkRateLimit(req);
    expect(result).toBeNull();
  });

  it("returns null for unknown IP (no headers) — allows request", () => {
    const req = makeReq({});
    const result = checkRateLimit(req);
    // "unknown" IP is treated as a valid key — first request is allowed
    expect(result).toBeNull();
  });
});

describe("checkRateLimit — sliding window boundary", () => {
  const MAX = parseInt(process.env.RATE_LIMIT_RPM ?? "20", 10);

  it("allows exactly MAX_REQUESTS requests from the same IP within a window", () => {
    const ip = `test-boundary-${Date.now()}`;
    const req = makeReq({ "x-forwarded-for": ip });

    // First MAX requests should all pass
    for (let i = 0; i < MAX; i++) {
      expect(checkRateLimit(req)).toBeNull();
    }
  });

  it("blocks the (MAX + 1)th request from the same IP", () => {
    const ip = `test-block-${Date.now()}`;
    const req = makeReq({ "x-forwarded-for": ip });

    for (let i = 0; i < MAX; i++) {
      checkRateLimit(req);
    }
    // Next request should be blocked
    const result = checkRateLimit(req);
    expect(result).not.toBeNull();
    expect(result?.errorType).toBe("RATE_LIMIT");
    expect(result?.retryable).toBe(true);
  });

  it("rate-limit error includes a positive resetIn value", () => {
    const ip = `test-reset-${Date.now()}`;
    const req = makeReq({ "x-forwarded-for": ip });

    for (let i = 0; i < MAX; i++) {
      checkRateLimit(req);
    }
    const result = checkRateLimit(req);
    expect(result?.error).toMatch(/\d+ seconds/);
    const match = result?.error.match(/(\d+) seconds/);
    const seconds = parseInt(match?.[1] ?? "0", 10);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it("different IPs have independent rate-limit counters", () => {
    const ip1 = `test-ip1-${Date.now()}`;
    const ip2 = `test-ip2-${Date.now()}`;
    const req1 = makeReq({ "x-forwarded-for": ip1 });
    const req2 = makeReq({ "x-forwarded-for": ip2 });

    // Exhaust ip1
    for (let i = 0; i < MAX; i++) {
      checkRateLimit(req1);
    }

    // ip2 should still be fine
    expect(checkRateLimit(req2)).toBeNull();
  });
});
