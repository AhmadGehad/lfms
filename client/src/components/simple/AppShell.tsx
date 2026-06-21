import DashboardLayout from "@/components/DashboardLayout";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
