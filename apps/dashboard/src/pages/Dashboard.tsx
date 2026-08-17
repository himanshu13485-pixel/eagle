import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { PageHeader } from "../components/Layout";
import { api } from "../lib/api";

interface Overview {
  totalEmployees: number;
  active: number;
  idle: number;
  offline: number;
  screenshotsToday: number;
  mostUsedApps: { name: string; seconds: number }[];
}

const COLORS = ["#6366F1", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4", "#A855F7"];

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="text-3xl font-black text-gray-900">{value}</div>
      <div className={`mt-1 text-sm font-medium ${tone ?? "text-gray-500"}`}>{label}</div>
    </div>
  );
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/dashboard/overview").then(setData).catch(() => setData(null));
  }, []);

  const pie = (data?.mostUsedApps ?? []).map((a) => ({ name: a.name, value: a.seconds }));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="How work actually happens across your team" />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Employees" value={data?.totalEmployees ?? "—"} />
        <StatCard label="Active now" value={data?.active ?? "—"} tone="text-green-600" />
        <StatCard label="Idle" value={data?.idle ?? "—"} tone="text-amber-600" />
        <StatCard label="Offline" value={data?.offline ?? "—"} tone="text-rose-500" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-lg font-bold text-gray-900">Most Used Applications (24h)</h3>
          {pie.length ? (
            <div className="space-y-3">
              {data!.mostUsedApps.map((a, i) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 truncate text-sm text-gray-700">{a.name}</span>
                  <span className="text-sm font-semibold text-gray-900">{fmt(a.seconds)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              No activity yet. Enroll an agent to start collecting data.
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-2 text-lg font-bold text-gray-900">Usage share</h3>
          <div className="h-52">
            {pie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {pie.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-gray-400">No data</div>
            )}
          </div>
          <div className="mt-4 rounded-xl bg-gray-50 p-3 text-center text-sm">
            <span className="font-bold text-gray-900">{data?.screenshotsToday ?? 0}</span>{" "}
            <span className="text-gray-500">screenshots today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
