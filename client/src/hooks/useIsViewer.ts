import { useAuth } from "@/lib/auth";

export function useIsViewer() {
  const { user } = useAuth();
  return user?.role === "viewer";
}
