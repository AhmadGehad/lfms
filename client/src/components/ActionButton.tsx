import { useAuth } from "@/lib/auth";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ReactNode } from "react";

interface ActionButtonProps extends ButtonProps {
  children: ReactNode;
}

/**
 * Button component that is disabled for viewer-role users.
 * Viewers see a disabled button with a tooltip instead.
 */
export function ActionButton({ 
  children, 
  ...props 
}: ActionButtonProps) {
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";

  if (isViewer) {
    return (
      <Button 
        {...props} 
        disabled 
        title="Viewers cannot perform actions"
        variant="outline"
      >
        {children}
      </Button>
    );
  }

  return <Button {...props}>{children}</Button>;
}
