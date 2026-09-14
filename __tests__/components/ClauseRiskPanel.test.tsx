/**
 * @jest-environment jsdom
 */

// ============================================================
// __tests__/components/ClauseRiskPanel.test.tsx
// Component tests for ClauseRiskPanel — idle/loading/error/
// populated states, filter tab behavior, clause expand/collapse.
// ============================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ClauseRiskPanel from "@/components/ClauseRiskPanel";
import { ClauseAnalysis } from "@/types";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;
window.fetch = mockFetch;

const ANALYSIS: ClauseAnalysis = {
  summary: "This is a test legal document governing service usage.",
  documentHash: "abc123",
  riskCount: { high: 1, medium: 0, low: 0 },
  clauses: [
    {
      id: "c1",
      text: "User waives all rights to class action lawsuits.",
      type: "risk",
      severity: "high",
      explanation: "You cannot join a class-action suit against the provider.",
      section: "Section 12",
    },
    {
      id: "c2",
      text: "Either party may terminate with 30 days notice.",
      type: "right",
      explanation: "You can exit the agreement by notifying the other party 30 days ahead.",
      section: "Section 5",
    },
  ],
};

function renderPanel(cachedAnalysis: ClauseAnalysis | null = null) {
  const onAnalysisComplete = jest.fn();
  render(
    <ClauseRiskPanel
      documentText="This is a test legal document text."
      documentHash="abc123"
      cachedAnalysis={cachedAnalysis}
      onAnalysisComplete={onAnalysisComplete}
    />
  );
  return { onAnalysisComplete };
}

describe("ClauseRiskPanel — idle state (no analysis)", () => {
  it("shows the analyze button when no analysis exists", () => {
    renderPanel(null);
    expect(screen.getByRole("button", { name: /run clause analysis/i })).toBeInTheDocument();
  });

  it("shows the panel heading", () => {
    renderPanel(null);
    expect(screen.getByText(/clause-by-clause risk analysis/i)).toBeInTheDocument();
  });
});

describe("ClauseRiskPanel — loading state", () => {
  it("shows loading skeletons while fetching", async () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => {})); // never resolves
    renderPanel(null);

    fireEvent.click(screen.getByRole("button", { name: /run clause analysis/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/extracting.*clauses/i).length).toBeGreaterThan(0);
    });
  });
});

describe("ClauseRiskPanel — error state", () => {
  it("shows error alert when API returns error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Service unavailable.",
        errorType: "SERVICE_UNAVAILABLE",
        retryable: true,
      }),
    });

    renderPanel(null);
    fireEvent.click(screen.getByRole("button", { name: /run clause analysis/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    });
  });

  it("shows retry button for retryable errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Service unavailable.",
        errorType: "SERVICE_UNAVAILABLE",
        retryable: true,
      }),
    });

    renderPanel(null);
    fireEvent.click(screen.getByRole("button", { name: /run clause analysis/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try running clause analysis again/i })).toBeInTheDocument();
    });
  });
});

describe("ClauseRiskPanel — populated state", () => {
  it("renders analysis when cachedAnalysis is provided", () => {
    renderPanel(ANALYSIS);
    expect(screen.getByText(/this is a test legal document/i)).toBeInTheDocument();
  });

  it("shows risk count cards", () => {
    renderPanel(ANALYSIS);
    expect(screen.getAllByText(/high risk/i).length).toBeGreaterThan(0);
    expect(screen.getByText("medium risks")).toBeInTheDocument();
    expect(screen.getByText("low risks")).toBeInTheDocument();
  });

  it("shows filter tabs", () => {
    renderPanel(ANALYSIS);
    expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /risk/i })).toBeInTheDocument();
  });

  it("filters clauses when filter tab is clicked", () => {
    renderPanel(ANALYSIS);
    // Initially shows all clauses
    expect(screen.getByText(/waives all rights/i)).toBeInTheDocument();
    expect(screen.getByText(/terminate with 30 days/i)).toBeInTheDocument();

    // Click "Risk" filter tab
    fireEvent.click(screen.getByRole("tab", { name: /^risk/i }));

    // Only risk clauses should be visible
    expect(screen.getByText(/waives all rights/i)).toBeInTheDocument();
    expect(screen.queryByText(/terminate with 30 days/i)).not.toBeInTheDocument();
  });

  it("expands clause body when clause button is clicked", () => {
    renderPanel(ANALYSIS);
    // Initially explanation is not visible
    expect(screen.queryByText(/cannot join a class-action/i)).not.toBeInTheDocument();

    // Click the clause toggle button (first expandable clause)
    const clauseBtn = screen.getByRole("button", { name: /waives all rights/i });
    fireEvent.click(clauseBtn);

    expect(screen.getByText(/cannot join a class-action/i)).toBeInTheDocument();
  });

  it("shows re-analyze button", () => {
    renderPanel(ANALYSIS);
    expect(screen.getByRole("button", { name: /re-run clause analysis/i })).toBeInTheDocument();
  });
});
