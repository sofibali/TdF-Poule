// Shared types for the docx + csv parsers.
// The reference implementation lives in scripts/validate_parser.py — both
// parsers should produce equivalent output for the historical files.

export type ParsedTeam = {
  player: string;            // "Quinten" or "Bas Otto" or "Unknown_3"
  team_name: string;
  riders: string[];          // raw names exactly as typed in the doc
  reserves: string[];        // raw names, in reserve order (1, 2, 3...)
  needs_attention: boolean;  // true when player starts with "Unknown_"
};

export type ParsedPool = {
  source: string;            // filename (for the import_log)
  year: number | null;       // detected from "Tour {YEAR}" in the header
  team_count: number;
  teams: ParsedTeam[];
  unresolved: string[];      // labels of teams Sofia needs to name
};

// Internal event stream shared between docx and csv producers.
export type ParserEvent =
  | { kind: "header"; player: string; team_name: string }
  | { kind: "table"; riders: string[] }
  | { kind: "reserves"; text: string };
