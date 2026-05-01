"use client";

// Generic client-side sort hook. Used by Leaderboard, Riders, and the
// All-teams matrix. Click the same key to flip direction; clicking a new
// key picks a sensible default direction (asc for strings, desc for numbers).

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export function useSortable<T extends Record<string, unknown>>(
  rows: T[],
  defaultKey: keyof T,
  defaultDir: SortDir = "desc",
) {
  const [key, setKey] = useState<keyof T>(defaultKey);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      if (as < bs) return dir === "asc" ? -1 : 1;
      if (as > bs) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, key, dir]);

  function clickHeader(nextKey: keyof T, numericDefault = true) {
    if (nextKey === key) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setKey(nextKey);
      setDir(numericDefault ? "desc" : "asc");
    }
  }

  return { rows: sorted, key, dir, clickHeader };
}

export function SortHeader<T extends Record<string, unknown>>({
  label,
  sortKey,
  state,
  numeric = true,
  className = "",
}: {
  label: string;
  sortKey: keyof T;
  state: { key: keyof T; dir: SortDir; clickHeader: (k: keyof T, n?: boolean) => void };
  numeric?: boolean;
  className?: string;
}) {
  const active = state.key === sortKey;
  const arrow = !active ? "↕" : state.dir === "asc" ? "▲" : "▼";
  return (
    <th
      onClick={() => state.clickHeader(sortKey, numeric)}
      className={`cursor-pointer select-none px-4 py-3 ${className} ${active ? "text-slate-900" : "hover:text-slate-700"}`}
    >
      {label}
      <span
        className={`ml-1 text-[0.65rem] ${active ? "opacity-100" : "opacity-30"}`}
      >
        {arrow}
      </span>
    </th>
  );
}
