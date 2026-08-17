import { AdminClientView } from "../../components/AdminClientView";
import { DataManagement } from "../DataManagement";

// Super Admin Data Management = the real org Data Management page, per selected client account.
export function AdminData() {
  return <AdminClientView sectionLabel="Data Management" component={DataManagement} />;
}
