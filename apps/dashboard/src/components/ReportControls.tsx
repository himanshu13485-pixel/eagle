import type { ReactNode } from "react";
import { defaultRange } from "../lib/format";

export interface Range {
  from: string;
  to: string;
}

export function RangeBar({
  range,
  onChange,
  right,
}: {
  range: Range;
  onChange: (r: Range) => void;
  right?: ReactNode;
}) {
  const quick = (days: number) => onChange(defaultRange(days));
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
        <span className="text-gray-400">→</span>
        <input
          type="date"
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
        <div className="ml-2 flex gap-1">
          {[
            { l: "Today", d: 0 },
            { l: "7d", d: 7 },
            { l: "14d", d: 14 },
            { l: "30d", d: 30 },
          ].map((q) => (
            <button
              key={q.l}
              onClick={() => quick(q.d)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              {q.l}
            </button>
          ))}
        </div>
      </div>
      {right}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
