// ============================================================
// __tests__/unit/ratelimit.test.ts
// Unit tests for lib/ratelimit.ts — IP extraction,
// Upstash Ratelimit integration, resetIn calculation,
// fail-open resilience, and fallback handling.
// ============================================================

import { NextRequest } from "next/server";
import { checkRateLimit, resetRatelimitInstanceForTesting, getClientIP } from "@/lib/ratelimit";

// Mock Upstash
const mockLimit = jest.fn();

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@upstash/ratelimit", () => {
  const MockRatelimit = jest.fn().mockImplementation(() => ({
    limit: mockLimit,
  }));
  (MockRatelimit as any).slidingWindow = jest.fn().mockReturnValue({});
  return { Ratelimit: MockRatelimit };
});

function makeReq(overrides: {
  "x-forwarded-for"?: string;
  "x-real-ip"?: string;
} = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (overrides["x-forwarded-for"]) headers["x-forwarded-for"] = overrides["x-forwarded-for"];
  if (overrides["x-real-ip"]) headers["x-real-ip"] = overrides["x-real-ip"];
  return new NextRequest("http://localhost/api/test", { method: "POST", headers });
}

describe("checkRateLimit — IP extraction & getClientIP", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("uses first IP from comma-separated x-forwarded-for chain", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 172.16.0.1" });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeReq({ "x-real-ip": "5.6.7.8" });
    expect(getClientIP(req)).toBe("5.6.7.8");
  });

  it("falls back to unknown when no IP headers exist", () => {
    const req = makeReq({});
    expect(getClientIP(req)).toBe("unknown");
  });
});

describe("checkRateLimit — Upstash Ratelimit enforcement", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      UPSTASH_REDIS_REST_URL: "https://test-redis.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    };
    resetRatelimitInstanceForTesting();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetRatelimitInstanceForTesting();
  });

  it("returns null (allows request) when within rate limit", async () => {
    mockLimit.mockResolvedValueOnce({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60000,
    });

    const req = makeReq({ "x-forwarded-for": "192.168.1.1" });
    const result = await checkRateLimit(req);

    expect(result).toBeNull();
    expect(mockLimit).toHaveBeenCalledWith("192.168.1.1");
  });

  it("returns RATE_LIMIT ApiError when rate limit is exceeded", async () => {
    const resetTime = Date.now() + 25000; // 25 seconds from now
    mockLimit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: resetTime,
    });

    const req = makeReq({ "x-forwarded-for": "192.168.1.2" });
    const result = await checkRateLimit(req);

    expect(result).not.toBeNull();
    expect(result?.errorType).toBe("RATE_LIMIT");
    expect(result?.retryable).toBe(true);
    expect(result?.error).toMatch(/Rate limit exceeded\. Please wait \d+ seconds before trying again\./);
  });

  it("calculates positive resetIn seconds when blocked", async () => {
    const resetTime = Date.now() + 15000; // 15 seconds from now
    mockLimit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: resetTime,
    });

    const req = makeReq({ "x-forwarded-for": "192.168.1.3" });
    const result = await checkRateLimit(req);

    const match = result?.error.match(/wait (\d+) seconds/);
    const seconds = parseInt(match?.[1] ?? "0", 10);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(20);
  });
});

describe("checkRateLimit — Fail-open resilience", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRatelimitInstanceForTesting();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetRatelimitInstanceForTesting();
  });

  it("fails open (returns null) when Upstash credentials are not configured", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRatelimitInstanceForTesting();

    const req = makeReq({ "x-forwarded-for": "1.1.1.1" });
    const result = await checkRateLimit(req);

    expect(result).toBeNull();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("fails open (returns null) when Redis limiter.limit throws a network error", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    resetRatelimitInstanceForTesting();

    mockLimit.mockRejectedValueOnce(new Error("Connection reset by peer"));

    const req = makeReq({ "x-forwarded-for": "1.1.1.1" });
    const result = await checkRateLimit(req);

    // Should not throw, should fail open
    expect(result).toBeNull();
  });
});
