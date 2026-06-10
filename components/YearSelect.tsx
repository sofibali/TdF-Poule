"use client";

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
      className="rounded-full border-2 border-amber-300 bg-white px-4 py-1.5 text-sm font-bold text-amber-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
