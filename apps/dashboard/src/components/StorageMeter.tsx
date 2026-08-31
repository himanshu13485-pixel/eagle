import { fmtBytes } from "../lib/format";

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percent: number;
  screenshotRetentionDays: number;
  activityRetentionDays: number;
  tier: string;
}

/** Used-vs-included storage for the org's plan, plus what happens at the cap. */
export function StorageMeter({ storage, className = "" }: { storage: StorageUsage; className?: string }) {
  const pct = Math.min(100, Math.max(0, storage.percent));
  const bar = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-brand";

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-gray-900">💾 Screenshot Storage</h3>
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{fmtBytes(storage.usedBytes)}</span> of {fmtBytes(storage.limitBytes)} used
          <span className="ml-1 text-gray-400">({pct}%)</span>
        </p>
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Your plan keeps screenshots for <b>{storage.screenshotRetentionDays} days</b> and activity logs for{" "}
        <b>{storage.activityRetentionDays} days</b>. Once either the age window or the storage cap is reached,
        the oldest screenshots are deleted automatically to make room.
      </p>

      {pct >= 90 && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          You're near your storage cap — the oldest screenshots will start being removed. Upgrade your plan,
          lengthen the screenshot interval, or lower the capture resolution in Settings to keep more history.
        </p>
      )}
    </div>
  );
}
