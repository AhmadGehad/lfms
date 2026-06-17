import { useAuth } from "@/_core/hooks/useAuth";

export function useIsViewer() {
  const { user } = useAuth();
  return user?.role === "viewer";
}
