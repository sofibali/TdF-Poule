"use client";

// Tiny year-selector. Server pages can't attach onChange handlers, so this
// lives in its own file marked "use client".

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function YearSelect({
  years,
  current,
}: {
  years: number[];
  current: number;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(sp);
    params.set("year", value);
    router.push(`${path}?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
