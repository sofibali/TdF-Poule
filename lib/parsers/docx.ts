// Word-doc team parser.
//
// Uses mammoth to convert .docx → HTML (preserving tables) and cheerio to
// walk the body in document order. Same state machine as the CSV parser
// (lib/parsers/parser.ts) so both formats produce the same ParsedPool shape.

import * as cheerio from "cheerio";
import mammoth from "mammoth";

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

export async function parsePoolDocx(
  buffer: Buffer,
  filename = "uploaded.docx",
): Promise<ParsedPool> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);

  // Year — sniff the first ~30 paragraphs for "Tour {YEAR}".
  let yearText = "";
  $("body")
    .find("p")
    .slice(0, 30)
    .each((_i, el) => {
      yearText += " " + $(el).text();
    });
  const year = findYear(yearText);

  const events: ParserEvent[] = [];

  // mammoth emits <p> for paragraphs and <table> for tables, alongside other
  // block-level elements we don't care about. Walk body children in order.
  $("body")
    .children()
    .each((_i, el) => {
      const node = el as { tagName?: string };
      const tag = (node.tagName || "").toLowerCase();
      if (tag === "p") {
        const text = $(el).text().trim();
        if (!text || isNoise(text)) return;
        if (RESERVES_PREFIX_RE.test(text)) {
          events.push({ kind: "reserves", text });
          return;
        }
        const header = extractHeader(text);
        if (header) events.push({ kind: "header", ...header });
      } else if (tag === "table") {
        const riders: string[] = [];
        $(el)
          .find("tr")
          .each((_j, tr) => {
            // Tour docs put the rider name in the first cell; subsequent cells
            // are stage scores filled in by hand (empty in our inputs).
            const first = $(tr).find("td").first().text();
            const name = cleanRiderName(first);
            if (!name) return;
            if (SKIP_HEADERS.has(name.toLowerCase())) return;
            riders.push(name);
          });
        events.push({ kind: "table", riders });
      }
    });

  return reduceEvents(filename, year, events);
}
