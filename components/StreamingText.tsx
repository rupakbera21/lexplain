"use client";

import { useEffect, useRef } from "react";

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  className?: string;
}

/**
 * Escapes HTML special characters to prevent XSS and malformed tags
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Parses inline formatting: bold, italic, inline code, and soft breaks
 */
function parseInline(str: string): string {
  return str
    // Inline code: `code`
    .replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`)
    // Bold: **text**
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic: *text* or _text_
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
}

/**
 * Robust markdown-to-HTML parser designed for legal text streaming.
 * Handles headings, tables, blockquotes, lists, code blocks, and paragraphs cleanly.
 */
function renderLegalMarkdown(raw: string): string {
  if (!raw) return "";

  // Normalize line endings
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const htmlParts: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Code block: ``` ... ```
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      htmlParts.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // Headings
    if (trimmed.startsWith("#### ")) {
      htmlParts.push(`<h4>${parseInline(escapeHtml(trimmed.slice(5)))}</h4>`);
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      htmlParts.push(`<h3>${parseInline(escapeHtml(trimmed.slice(4)))}</h3>`);
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      htmlParts.push(`<h2>${parseInline(escapeHtml(trimmed.slice(3)))}</h2>`);
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      htmlParts.push(`<h1>${parseInline(escapeHtml(trimmed.slice(2)))}</h1>`);
      i++;
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(escapeHtml(lines[i].trim().replace(/^>\s?/, "")));
        i++;
      }
      htmlParts.push(`<blockquote>${parseInline(quoteLines.join("<br />"))}</blockquote>`);
      continue;
    }

    // Markdown Table: line contains |
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        // Check if second row is separator (| --- | --- |)
        const isSep = tableLines[1].replace(/[\s|:-]/g, "").length === 0;
        const bodyRows = tableLines.slice(isSep ? 2 : 1).map((r) =>
          r
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim())
        );

        let tableHtml = '<div class="table-responsive"><table><thead><tr>';
        headerRow.forEach((h) => {
          tableHtml += `<th>${parseInline(escapeHtml(h))}</th>`;
        });
        tableHtml += "</tr></thead><tbody>";
        bodyRows.forEach((row) => {
          tableHtml += "<tr>";
          row.forEach((cell) => {
            tableHtml += `<td>${parseInline(escapeHtml(cell))}</td>`;
          });
          tableHtml += "</tr>";
        });
        tableHtml += "</tbody></table></div>";
        htmlParts.push(tableHtml);
        continue;
      }
    }

    // Unordered List: * or - or •
    if (/^[\*\-•]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[\*\-•]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[\*\-•]\s+/, "");
        listItems.push(`<li>${parseInline(escapeHtml(itemText))}</li>`);
        i++;
      }
      htmlParts.push(`<ul>${listItems.join("")}</ul>`);
      continue;
    }

    // Ordered List: 1. or 2.
    if (/^\d+[\.\)]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+[\.\)]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+[\.\)]\s+/, "");
        listItems.push(`<li>${parseInline(escapeHtml(itemText))}</li>`);
        i++;
      }
      htmlParts.push(`<ol>${listItems.join("")}</ol>`);
      continue;
    }

    // Regular Paragraph: collect contiguous non-blank lines until next block element
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("```") &&
      !/^[\*\-•]\s+/.test(lines[i].trim()) &&
      !/^\d+[\.\)]\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|"))
    ) {
      pLines.push(escapeHtml(lines[i].trim()));
      i++;
    }

    if (pLines.length > 0) {
      htmlParts.push(`<p>${parseInline(pLines.join("<br />"))}</p>`);
    }
  }

  return htmlParts.join("");
}

export default function StreamingText({ text, isStreaming, className = "" }: StreamingTextProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [text, isStreaming]);

  if (!text && !isStreaming) return null;

  return (
    <div
      aria-live={isStreaming ? "polite" : "off"}
      aria-atomic="false"
      className={`prose-legal ${className}`}
    >
      <div
        dangerouslySetInnerHTML={{ __html: renderLegalMarkdown(text) }}
        className={isStreaming ? "streaming-cursor" : ""}
      />
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}

