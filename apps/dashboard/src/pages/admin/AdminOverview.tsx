import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import { AdminHeader } from "../../components/AdminLayout";

interface Overview {
  clients: number; activeClients: number; suspendedClients: number;
  superAdmins: number; subAdmins: number; salespeople: number;
}

export function AdminOverview() {
  const nav = useNavigate();
  const [d, setD] = useState<Overview | null>(null);
  useEffect(() => { adminApi<Overview>("/overview").then(setD).catch(() => setD(null)); }, []);

  return (
    <div>
      <AdminHeader title="Platform Overview" subtitle="Clients and staff across the whole platform." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Clients" value={d?.clients ?? 0} tone="text-brand" onClick={() => nav("/admin/clients")} sub="View all →" />
        <Stat label="Active Clients" value={d?.activeClients ?? 0} tone="text-green-600" />
        <Stat label="Suspended" value={d?.suspendedClients ?? 0} tone="text-rose-600" />
        <Stat label="Super Admins" value={d?.superAdmins ?? 0} tone="text-gray-800" onClick={() => nav("/admin/staff")} sub="Manage staff →" />
        <Stat label="Sub Admins" value={d?.subAdmins ?? 0} tone="text-gray-800" />
        <Stat label="Salespeople" value={d?.salespeople ?? 0} tone="text-amber-600" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone, sub, onClick }: { label: string; value: number; tone: string; sub?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-2xl bg-white p-6 shadow-sm ${onClick ? "cursor-pointer transition hover:shadow-md" : ""}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-4xl font-black ${tone}`}>{value}</p>
      {sub && <p className="mt-2 text-xs font-semibold text-brand">{sub}</p>}
    </div>
  );
}
