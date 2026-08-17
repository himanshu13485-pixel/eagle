import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Employees } from "./pages/Employees";
import { EmployeeProfile } from "./pages/EmployeeProfile";
import { Screenshots } from "./pages/Screenshots";
import { Settings } from "./pages/Settings";
import { LiveMonitoring } from "./pages/LiveMonitoring";
import { Timesheet } from "./pages/Timesheet";
import { AppWebsiteUsage } from "./pages/AppWebsiteUsage";
import { ProductivityTrends } from "./pages/ProductivityTrends";
import { WorkReplay } from "./pages/WorkReplay";
import { Teams } from "./pages/Teams";
import { Billing } from "./pages/Billing";
import { DataManagement } from "./pages/DataManagement";
import { HelpSupport } from "./pages/HelpSupport";
import { AdminLayout } from "./components/AdminLayout";
import { getAdminToken } from "./lib/adminApi";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminClients } from "./pages/admin/AdminClients";
import { AdminStaff } from "./pages/admin/AdminStaff";
import { AdminNotifications } from "./pages/admin/AdminNotifications";
import { AdminSubscriptions } from "./pages/admin/AdminSubscriptions";
import { AdminScreenshots } from "./pages/admin/AdminScreenshots";
import { AdminLive } from "./pages/admin/AdminLive";
import { AdminData } from "./pages/admin/AdminData";
import { AdminReplay } from "./pages/admin/AdminReplay";
import { AdminReports } from "./pages/admin/AdminReports";
import { AdminSupport } from "./pages/admin/AdminSupport";
import { AdminInvoices } from "./pages/admin/AdminInvoices";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid h-screen place-items-center text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Layout>{children}</Layout>;
}

function AdminProtected({ children }: { children: JSX.Element }) {
  if (!getAdminToken()) return <Navigate to="/admin/login" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/employees" element={<Protected><Employees /></Protected>} />
      <Route path="/employees/:id" element={<Protected><EmployeeProfile /></Protected>} />
      <Route path="/screenshots" element={<Protected><Screenshots /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/live" element={<Protected><LiveMonitoring /></Protected>} />
      <Route path="/work-replay" element={<Protected><WorkReplay /></Protected>} />
      <Route path="/teams" element={<Protected><Teams /></Protected>} />
      <Route path="/reports/timesheet" element={<Protected><Timesheet /></Protected>} />
      <Route path="/reports/app-website" element={<Protected><AppWebsiteUsage /></Protected>} />
      <Route path="/reports/productivity" element={<Protected><ProductivityTrends /></Protected>} />
      <Route path="/data" element={<Protected><DataManagement /></Protected>} />
      <Route path="/billing" element={<Protected><Billing /></Protected>} />
      <Route path="/help" element={<Protected><HelpSupport /></Protected>} />

      {/* Super Admin console (separate platform auth) */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminProtected><AdminOverview /></AdminProtected>} />
      <Route path="/admin/clients" element={<AdminProtected><AdminClients /></AdminProtected>} />
      <Route path="/admin/live" element={<AdminProtected><AdminLive /></AdminProtected>} />
      <Route path="/admin/subscriptions" element={<AdminProtected><AdminSubscriptions /></AdminProtected>} />
      <Route path="/admin/screenshots" element={<AdminProtected><AdminScreenshots /></AdminProtected>} />
      <Route path="/admin/replay" element={<AdminProtected><AdminReplay /></AdminProtected>} />
      <Route path="/admin/data" element={<AdminProtected><AdminData /></AdminProtected>} />
      <Route path="/admin/reports" element={<AdminProtected><AdminReports /></AdminProtected>} />
      <Route path="/admin/support" element={<AdminProtected><AdminSupport /></AdminProtected>} />
      <Route path="/admin/invoices" element={<AdminProtected><AdminInvoices /></AdminProtected>} />
      <Route path="/admin/notifications" element={<AdminProtected><AdminNotifications /></AdminProtected>} />
      <Route path="/admin/staff" element={<AdminProtected><AdminStaff /></AdminProtected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
