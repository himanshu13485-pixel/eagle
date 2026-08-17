import { AdminClientView } from "../../components/AdminClientView";
import { WorkReplay } from "../WorkReplay";

// Super Admin Work Replay = the real org Work Replay page, per selected client account.
export function AdminReplay() {
  return <AdminClientView sectionLabel="Work Replay" component={WorkReplay} />;
}
