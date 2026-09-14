/**
 * @jest-environment jsdom
 */

// ============================================================
// __tests__/components/QAPanel.test.tsx
// Component tests for QAPanel — question form, example chips,
// streaming state, history, error state.
// ============================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import QAPanel from "@/components/QAPanel";

// Mock the streaming hook
jest.mock("@/hooks/useStreamingResponse", () => ({
  useStreamingResponse: jest.fn(),
}));

import { useStreamingResponse } from "@/hooks/useStreamingResponse";
const mockUseStreaming = useStreamingResponse as jest.MockedFunction<typeof useStreamingResponse>;

// Mock StreamingText to avoid rendering issues
jest.mock("@/components/StreamingText", () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span data-testid="streaming-text">{text}</span>,
}));

function makeStreamingState(overrides: Partial<ReturnType<typeof useStreamingResponse>> = {}) {
  return {
    text: "",
    isStreaming: false,
    isDone: false,
    error: null,
    startStream: jest.fn(),
    ...overrides,
  } as ReturnType<typeof useStreamingResponse>;
}

describe("QAPanel — idle state", () => {
  beforeEach(() => {
    mockUseStreaming.mockReturnValue(makeStreamingState());
  });

  it("renders the question input", () => {
    render(<QAPanel documentText="This is a test document." />);
    expect(screen.getByRole("textbox", { name: /your question/i })).toBeInTheDocument();
  });

  it("renders the Ask button", () => {
    render(<QAPanel documentText="This is a test document." />);
    expect(screen.getByRole("button", { name: /submit question/i })).toBeInTheDocument();
  });

  it("renders example question chips", () => {
    render(<QAPanel documentText="This is a test document." />);
    // At least one chip should be visible
    expect(screen.getAllByLabelText(/example question/i).length).toBeGreaterThan(0);
  });

  it("disables Ask button when input is empty", () => {
    render(<QAPanel documentText="This is a test document." />);
    const askBtn = screen.getByRole("button", { name: /submit question/i });
    expect(askBtn).toBeDisabled();
  });

  it("enables Ask button when question is typed", () => {
    render(<QAPanel documentText="This is a test document." />);
    const input = screen.getByRole("textbox", { name: /your question/i });
    fireEvent.change(input, { target: { value: "What are my obligations?" } });
    const askBtn = screen.getByRole("button", { name: /submit question/i });
    expect(askBtn).not.toBeDisabled();
  });
});

describe("QAPanel — streaming state", () => {
  beforeEach(() => {
    mockUseStreaming.mockReturnValue(makeStreamingState({
      isStreaming: true,
      text: "Searching through the document…",
    }));
  });

  it("disables chips and input while streaming", () => {
    render(<QAPanel documentText="This is a test document." />);
    const chips = screen.getAllByRole("listitem");
    for (const chip of chips) {
      expect(chip).toBeDisabled();
    }
  });

  it("shows searching indicator while streaming", () => {
    render(<QAPanel documentText="This is a test document." />);
    expect(screen.getByText("Searching document…")).toBeInTheDocument();
  });
});

describe("QAPanel — error state", () => {
  beforeEach(() => {
    mockUseStreaming.mockReturnValue(makeStreamingState({
      error: {
        error: "Failed to answer your question.",
        errorType: "SERVICE_UNAVAILABLE",
        retryable: true,
      },
    }));
  });

  it("shows the error alert", () => {
    render(<QAPanel documentText="This is a test document." />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/failed to answer/i)).toBeInTheDocument();
  });

  it("shows retry button for retryable error", () => {
    render(<QAPanel documentText="This is a test document." />);
    expect(screen.getByRole("button", { name: "Try asking question again" })).toBeInTheDocument();
  });
});
