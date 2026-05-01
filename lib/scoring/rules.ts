// Scoring rules for the family TDF pool.
// Ported from tdf_engine.py STAGE_POINTS / FINAL_POINTS constants.
// TODO (task #3): confirm with Sofia these are the actual house rules — the v1 file may be a guess.

export const STAGE_POINTS: Record<number, number> = {
  1: 20,
  2: 15,
  3: 12,
  4: 10,
  5: 8,
  6: 6,
  7: 5,
  8: 4,
  9: 3,
  10: 2,
};

export const FINAL_POINTS: Record<number, number> = {
  1: 100,
  2: 80,
  3: 60,
  4: 40,
  5: 30,
  6: 25,
  7: 20,
  8: 18,
  9: 16,
  10: 15,
};

// Reserves can only substitute through end of stage 6 (then locked).
export const RESERVE_LOCK_STAGE = 6;

// Reserve count varies by year — COVID years had different rules. The
// docx header for each year states the count; the parser reads it and stores
// it on the `pools` row as `reserves_allowed`. The 2026 default is 3.
export const DEFAULT_RESERVES_ALLOWED = 3;
