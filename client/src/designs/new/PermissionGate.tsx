import { isValidElement, Suspense, useEffect } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import AccessDenied from "@/pages/AccessDenied";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionPage } from "@shared/permissions";

type SkeletonVariant = React.ComponentProps<typeof PageSkeleton>["variant"];

/** Renders a page only for users allowed to view it, with a skeleton while permissions and the page chunk load. */
export function PermissionGate({
  page,
  skeleton = "table",
  children,
}: {
  page: PermissionPage;
  skeleton?: SkeletonVariant;
  children: React.ReactNode;
}) {
  const permissions = usePermissions(page);
  // Download the page's code alongside the permission check rather than after it.
  const preload = isValidElement(children) ? (children.type as { preload?: () => Promise<unknown> }).preload : undefined;
  useEffect(() => {
    void preload?.();
  }, [preload]);
  if (permissions.loading) return <PageSkeleton variant={skeleton} />;
  if (!permissions.canView) return <AccessDenied />;
  // Suspends while the page's own chunk downloads.
  return <Suspense fallback={<PageSkeleton variant={skeleton} />}>{children}</Suspense>;
}
