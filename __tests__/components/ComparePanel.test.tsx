/**
 * @jest-environment jsdom
 */

// ============================================================
// __tests__/components/ComparePanel.test.tsx
// Component tests for ComparePanel — upload state, loading,
// error, and populated result states.
// ============================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ComparePanel from "@/components/ComparePanel";
import { ComparisonResult } from "@/types";

// Mock DocumentUploader to avoid complex drag-drop setup
jest.mock("@/components/DocumentUploader", () => ({
  __esModule: true,
  default: ({ onDocumentLoaded }: { onDocumentLoaded: (t: string, n: string, h: string) => void }) => (
    <div>
      <button
        onClick={() => onDocumentLoaded("Second doc content long enough.", "doc2.txt", "hash2")}
        data-testid="mock-uploader-btn"
      >
        Load Second Document
      </button>
    </div>
  ),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const MOCK_RESULT: ComparisonResult = {
  items: [
    {
      aspect: "Termination clause",
      doc1Summary: "30 days notice required.",
      doc2Summary: "Immediate termination allowed.",
      difference: "Document 2 allows immediate termination without notice.",
      significance: "major",
    },
  ],
  overallDifferences: "The documents differ significantly on termination rights.",
  recommendation: "Document 1 is more favorable.",
};

describe("ComparePanel — initial upload state", () => {
  it("shows heading and uploader before second doc is loaded", () => {
    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    expect(screen.getByText(/document comparison/i)).toBeInTheDocument();
  });

  it("does not show Compare button until second document loaded", () => {
    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    expect(screen.queryByRole("button", { name: /compare/i })).not.toBeInTheDocument();
  });
});

describe("ComparePanel — after second doc loaded", () => {
  it("shows Compare button after second document is loaded", async () => {
    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    fireEvent.click(screen.getByTestId("mock-uploader-btn"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /compare/i })).toBeInTheDocument();
    });
  });
});

describe("ComparePanel — loading state", () => {
  it("shows loading indicator while comparing", async () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => {})); // never resolves
    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    fireEvent.click(screen.getByTestId("mock-uploader-btn"));

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/comparing/i)).toBeInTheDocument();
    });
  });
});

describe("ComparePanel — error state", () => {
  it("shows error alert when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Comparison failed.",
        errorType: "SERVICE_UNAVAILABLE",
        retryable: true,
      }),
    });

    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    fireEvent.click(screen.getByTestId("mock-uploader-btn"));

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/comparison failed/i)).toBeInTheDocument();
    });
  });
});

describe("ComparePanel — populated result state", () => {
  it("shows comparison results after successful API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_RESULT,
    });

    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    fireEvent.click(screen.getByTestId("mock-uploader-btn"));

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/termination clause/i)).toBeInTheDocument();
    });
  });

  it("shows significance badges for each comparison item", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_RESULT,
    });

    render(<ComparePanel primaryText="Primary document text." primaryName="doc1.pdf" />);
    fireEvent.click(screen.getByTestId("mock-uploader-btn"));

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/major difference/i)).toBeInTheDocument();
    });
  });
});
