import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EmployeeDto, Paginated, ScreenshotDto } from "@eagle/shared";
import { RT_EVENTS } from "@eagle/shared";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";

const TRIGGER_STYLE: Record<string, string> = {
  PERIODIC: "bg-blue-50 text-blue-600",
  APP_SWITCH: "bg-amber-50 text-amber-600",
  WEBCAM: "bg-purple-50 text-purple-600",
  ON_DEMAND: "bg-emerald-50 text-emerald-600",
};
const triggerLabel = (t: string) => (t === "APP_SWITCH" ? "App switch" : t === "WEBCAM" ? "Webcam" : t === "ON_DEMAND" ? "On demand" : "Periodic");

const PAGE_SIZES = [10, 25, 50, 100];

export function Screenshots() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<Paginated<ScreenshotDto> | null>(null);
  const [viewer, setViewer] = useState<number | null>(null); // index into data.items

  useEffect(() => {
    api<EmployeeDto[]>("/employees").then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (employeeId) p.set("employeeId", employeeId);
    if (fromDate) p.set("from", new Date(`${fromDate}T${startTime || "00:00"}:00`).toISOString());
    if (toDate) p.set("to", new Date(`${toDate}T${endTime || "23:59"}:59`).toISOString());
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [employeeId, fromDate, toDate, startTime, endTime, page, pageSize]);

  const load = useCallback(() => {
    api<Paginated<ScreenshotDto>>(`/screenshots?${query}`).then(setData).catch(() => setData(null));
  }, [query]);
  useEffect(() => { load(); }, [load]);

  // Live: refresh the first page when a new screenshot lands.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket(user.orgId);
    const handler = () => { if (page === 1) load(); };
    socket.on(RT_EVENTS.screenshotCreated, handler);
    return () => { socket.off(RT_EVENTS.screenshotCreated, handler); };
  }, [user, page, load]);

  const hasFilter = employeeId || fromDate || toDate;
  function clearFilters() {
    setEmployeeId(""); setFromDate(""); setToDate(""); setStartTime("00:00"); setEndTime("23:59"); setPage(1);
  }

  const total = data?.total ?? 0;
  function changePageSize(n: number) { setPageSize(n); setPage(1); }

  return (
    <div>
      <PageHeader
        title="Screenshots"
        subtitle="Periodic and app-switch captures across your team"
        action={<span className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">{total} screenshots</span>}
      />

      {/* filters */}
      <div className="mb-6 grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <Filter label="Employee">
          <select value={employeeId} onChange={(e) => { setPage(1); setEmployeeId(e.target.value); }} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm">
            <option value="">All Employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Filter>
        <Filter label="Date range" className="sm:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            <span className="shrink-0 text-gray-400">–</span>
            <input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
          </div>
        </Filter>
        <Filter label="Start time">
          <input type="time" value={startTime} onChange={(e) => { setPage(1); setStartTime(e.target.value); }} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
        </Filter>
        <Filter label="End time">
          <input type="time" value={endTime} onChange={(e) => { setPage(1); setEndTime(e.target.value); }} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
        </Filter>
        {hasFilter && (
          <div className="flex items-end sm:col-span-2 lg:col-span-5">
            <button onClick={clearFilters} className="text-sm font-semibold text-brand">Clear filters</button>
          </div>
        )}
      </div>

      {data && data.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((s, i) => (
            <button key={s.id} onClick={() => setViewer(i)} className="overflow-hidden rounded-2xl bg-white text-left shadow-sm transition hover:shadow-md">
              <img src={s.imageUrl} alt={s.app ?? "screenshot"} className="h-44 w-full bg-gray-100 object-cover" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-semibold text-gray-800">{s.employeeName}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${TRIGGER_STYLE[s.trigger]}`}>{triggerLabel(s.trigger)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                  <span className="truncate">{s.isIdle ? "Idle" : s.app ?? s.url ?? "—"}</span>
                  <span>{new Date(s.capturedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid place-items-center rounded-2xl border border-dashed border-gray-300 bg-white py-24 text-center text-gray-400">
          No screenshots for this filter. Enroll an agent to start capturing.
        </div>
      )}

      {/* pagination */}
      {total > 0 && (
        <PageBar page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={changePageSize} />
      )}

      {viewer !== null && data && data.items[viewer] && (
        <Lightbox
          items={data.items}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

/** SuperSee-style pagination: items-per-page, item range, arrows, and a searchable page picker. */
function PageBar({ page, pageSize, total, onPage, onPageSize }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const pages = useMemo(() => {
    const list = Array.from({ length: totalPages }, (_, i) => {
      const p = i + 1;
      const start = (p - 1) * pageSize + 1;
      const end = Math.min(p * pageSize, total);
      return { p, start, end };
    });
    const q = search.trim();
    return q ? list.filter((x) => String(x.p).includes(q)) : list;
  }, [totalPages, pageSize, total, search]);

  return (
    <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 text-sm shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-gray-500">Items per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700"
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="ml-2 text-gray-600">
          <span className="font-semibold text-gray-800">{firstItem} – {lastItem}</span> of <span className="font-semibold text-gray-800">{total}</span>
        </span>
        <div className="ml-2 flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40">‹</button>
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40">›</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-gray-500">Current Page:</span>
        <div className="relative">
          <button
            onClick={() => { setOpen((o) => !o); setSearch(""); }}
            className="flex min-w-[130px] items-center justify-between gap-3 rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-800 hover:border-brand"
          >
            {page} of {totalPages}
            <span className={`text-gray-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl">
                <div className="border-b border-gray-100 p-2">
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search page number…"
                    className="w-full rounded-lg bg-gray-50 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {pages.map(({ p, start, end }) => {
                    const active = p === page;
                    return (
                      <button
                        key={p}
                        ref={active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                        onClick={() => { onPage(p); setOpen(false); }}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${active ? "bg-brand/10" : "hover:bg-gray-50"}`}
                      >
                        <span className={`grid h-7 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-brand/20 text-brand" : "bg-gray-100 text-gray-600"}`}>{p}</span>
                        <span className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${active ? "bg-brand/10 text-brand" : "bg-gray-50 text-gray-500"}`}>Range: {start}-{end}</span>
                        {active && <span className="pr-1 text-brand">✓</span>}
                      </button>
                    );
                  })}
                  {!pages.length && <p className="px-3 py-6 text-center text-xs text-gray-400">No page matches “{search}”.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Filter({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  );
}

/** Full-screen screenshot viewer: top close, bottom detail bar, on-screen + arrow-key prev/next. */
function Lightbox({ items, index, onIndex, onClose }: {
  items: ScreenshotDto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const s = items[index];
  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < items.length) onIndex(next);
  }, [index, items.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={onClose}>
      {/* top bar */}
      <div className="flex items-center justify-center gap-4 p-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => go(-1)} disabled={index === 0} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30">‹</button>
        <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white">{index + 1} / {items.length}</span>
        <button onClick={() => go(1)} disabled={index === items.length - 1} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30">›</button>
        <button onClick={onClose} className="absolute right-4 flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100">✕ Close</button>
      </div>

      {/* image */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4" onClick={(e) => e.stopPropagation()}>
        <img src={s.imageUrl} alt={s.app ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>

      {/* bottom detail bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-6 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">{s.employeeName}</span>
          <span className="text-sm text-gray-400">·</span>
          <span className="text-sm text-gray-600">{s.isIdle ? "Idle" : s.app ?? s.url ?? "—"}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{new Date(s.capturedAt).toLocaleString()}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TRIGGER_STYLE[s.trigger]}`}>{triggerLabel(s.trigger)}</span>
        </div>
      </div>
    </div>
  );
}
