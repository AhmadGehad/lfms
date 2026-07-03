import DashboardLayout from "@/components/DashboardLayout";
import { AppRoutes } from "../routes";

/**
 * The Old (current) design: the existing DashboardLayout shell wrapping the
 * shared route table. This is the safe-fallback design — unchanged behaviour.
 */
export default function OldDesign() {
  return (
    <DashboardLayout>
      <AppRoutes />
    </DashboardLayout>
  );
}
