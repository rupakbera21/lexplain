// ============================================================
// hooks/useStreamingResponse.ts — SSE consumer for streaming AI responses
// ============================================================

"use client";

import { useState, useCallback, useRef } from "react";
import { ApiError } from "@/types";

interface StreamingState {
  text: string;
  isStreaming: boolean;
  isDone: boolean;
  error: ApiError | null;
}

export function useStreamingResponse() {
  const [state, setState] = useState<StreamingState>({
    text: "",
    isStreaming: false,
    isDone: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (url: string, body: object) => {
    // Cancel any existing stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ text: "", isStreaming: true, isDone: false, error: null });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err: ApiError = await res.json().catch(() => ({
          error: "Request failed. Please try again.",
          errorType: "UNKNOWN" as const,
          retryable: true,
        }));
        setState({ text: "", isStreaming: false, isDone: false, error: err });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setState({
          text: "",
          isStreaming: false,
          isDone: false,
          error: { error: "Streaming not supported.", errorType: "UNKNOWN", retryable: false },
        });
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          if (data === "[DONE]") {
            setState((prev) => ({ ...prev, isStreaming: false, isDone: true }));
            return;
          }

          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string; errorType?: string };

            if (parsed.error) {
              setState({
                text: accumulated,
                isStreaming: false,
                isDone: false,
                error: {
                  error: parsed.error,
                  errorType: (parsed.errorType as ApiError["errorType"]) ?? "UNKNOWN",
                  retryable: true,
                },
              });
              return;
            }

            if (parsed.text) {
              accumulated += parsed.text;
              setState((prev) => ({ ...prev, text: accumulated }));
            }
          } catch {
            // Ignore malformed SSE chunks
          }
        }
      }

      setState((prev) => ({ ...prev, isStreaming: false, isDone: true }));
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        setState((prev) => ({ ...prev, isStreaming: false }));
        return;
      }
      setState({
        text: "",
        isStreaming: false,
        isDone: false,
        error: { error: "Connection error. Please check your network and try again.", errorType: "UNKNOWN", retryable: true },
      });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ text: "", isStreaming: false, isDone: false, error: null });
  }, []);

  return { ...state, startStream, reset };
}
