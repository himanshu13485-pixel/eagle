import { useState } from "react";
import { AdminClientView } from "../../components/AdminClientView";
import { Timesheet } from "../Timesheet";
import { AppWebsiteUsage } from "../AppWebsiteUsage";
import { ProductivityTrends } from "../ProductivityTrends";

const TABS = [
  { key: "timesheet", label: "Timesheet", el: <Timesheet /> },
  { key: "app", label: "App & Website Usage", el: <AppWebsiteUsage /> },
  { key: "productivity", label: "Productivity Trends", el: <ProductivityTrends /> },
] as const;

// The three real org report pages under tabs (remounted per client by AdminClientView).
function ReportsTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("timesheet");
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {TABS.find((t) => t.key === tab)?.el}
    </div>
  );
}

// Super Admin Reports = the real org report pages, per selected client account.
export function AdminReports() {
  return <AdminClientView sectionLabel="Reports" component={ReportsTabs} />;
}
