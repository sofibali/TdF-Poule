// CSV team parser. Same output shape as docx.ts.
//
// Source files: TDF 2025.csv, Tour.2024.csv, Tour.2022.csv, Tour.2021.csv.
// Reference implementation: scripts/validate_parser.py (Python).
//
// The CSV layout differs slightly from docx — reserves come AFTER the rider
// table instead of before it (in docx the reserves come after too, so the
// state machine is the same). Header rows are top-level cells.

import {
  cleanRiderName,
  extractHeader,
  findYear,
  isNoise,
  reduceEvents,
  SKIP_HEADERS,
} from "./parser";
import type { ParsedPool, ParserEvent } from "./types";

const RESERVES_PREFIX_RE = /^\s*reserve/i;

/** Minimal RFC4180-ish CSV row splitter. Handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (c === "\r") {
        // ignore — \n handles row break
      } else {
        cell += c;
      }
    }
  }
  // Flush final row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parsePoolCsv(
  text: string,
  filename = "uploaded.csv",
): ParsedPool {
  const rows = parseCsv(text);

  // Year — scan the first 5 non-empty rows for "Tour {YEAR}".
  let year: number | null = null;
  for (const row of rows.slice(0, 5)) {
    const joined = row.filter(Boolean).join(" ").trim();
    const y = findYear(joined);
    if (y) {
      year = y;
      break;
    }
  }

  const events: ParserEvent[] = [];
  let inTable = false;
  let tableRiders: string[] = [];

  const flushTable = () => {
    if (tableRiders.length > 0) {
      events.push({ kind: "table", riders: tableRiders });
      tableRiders = [];
    }
  };

  for (const row of rows) {
    const first = (row[0] || "").trim();
    const joined = row
      .map((c) => c.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!joined || isNoise(joined)) continue;

    // Reserves line — closes the open team and may carry a trailing header.
    if (RESERVES_PREFIX_RE.test(joined)) {
      flushTable();
      inTable = false;
      events.push({ kind: "reserves", text: joined });
      continue;
    }

    // Rider table column-header row.
    if (first.toLowerCase().startsWith("renner/etappe")) {
      inTable = true;
      continue;
    }

    // Footer row (dagtotaal/cumulatief/totaal) closes the rider list.
    if (SKIP_HEADERS.has(first.toLowerCase())) {
      flushTable();
      inTable = false;
      continue;
    }

    // Possessive header — e.g. "Quinten's Snelste Tijden" in cell 0.
    const header = extractHeader(joined) || extractHeader(first);
    if (header && !inTable) {
      flushTable();
      events.push({ kind: "header", ...header });
      continue;
    }

    // Rider row.
    if (inTable && first) {
      tableRiders.push(cleanRiderName(first));
    }
  }
  flushTable();

  return reduceEvents(filename, year, events);
}
