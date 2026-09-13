import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Lexplain — Legal Documents in Plain Language",
  description:
    "Upload any legal document and get plain-language explanations, clause-by-clause risk analysis, document comparison, grounded Q&A, and a personalised before-you-sign checklist. Powered by Google Gemini AI.",
  keywords: ["legal document", "plain language", "legal AI", "document analysis", "NDA", "lease", "employment contract"],
  openGraph: {
    title: "Lexplain — Legal Documents in Plain Language",
    description: "GenAI-powered legal document companion. Upload a contract, get clarity.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.cdnfonts.com" crossOrigin="anonymous" />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
