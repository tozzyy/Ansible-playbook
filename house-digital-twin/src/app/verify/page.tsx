import { Sidebar } from "@/components/verify/Sidebar";
import { DetailsPanel } from "@/components/verify/DetailsPanel";
import { PlanOverlay } from "@/components/verify/PlanOverlay";

export const metadata = { title: "2D Verification Overlay · House Digital Twin" };

export default function VerifyPage() {
  return (
    <div className="flex min-h-0 flex-1" style={{ height: "calc(100vh - 3rem)" }}>
      <Sidebar />
      <div className="min-w-0 flex-1">
        <PlanOverlay />
      </div>
      <DetailsPanel />
    </div>
  );
}
