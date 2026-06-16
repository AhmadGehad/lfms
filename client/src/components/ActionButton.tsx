import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import type { ButtonHTMLAttributes } from "react";

import { ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

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
