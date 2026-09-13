"use client";

export default function DisclaimerBanner() {
  return (
    <div
      role="banner"
      aria-label="Legal disclaimer"
      className="disclaimer-banner"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "0.55rem 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6rem",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: "0.75rem", color: "#0284c7", letterSpacing: "0.1em" }}
      >
        ⚖
      </span>
      <span>
        <strong style={{ fontWeight: 600 }}>Lexplain explains legal documents in plain language.</strong>
        {" "}It does not provide legal advice. Consult a qualified solicitor before acting on any information.
      </span>
    </div>
  );
}
