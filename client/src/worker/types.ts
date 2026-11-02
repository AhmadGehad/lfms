import type { inferRouterOutputs } from "@trpc/server";
import type { BlockedReason, TaskAction } from "@shared/tasks";
import type { AppRouter } from "../../../server/routers";

export type TabletDay = inferRouterOutputs<AppRouter>["tasks"]["today"];
export type TabletTask = TabletDay["tasks"][number];
export type TabletWorker = TabletDay["workers"][number];
export type TabletReport = TabletDay["reports"][number];

export type RecordAction = (input: {
  task: TabletTask;
  action: TaskAction;
  workerId?: number | null;
  reason?: BlockedReason;
}) => void;
