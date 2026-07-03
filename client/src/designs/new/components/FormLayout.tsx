import * as React from "react";
import { cn } from "@/lib/utils";

const FIELD_CONTROL_NAMES = new Set(["input", "select", "textarea", "Input", "SelectTrigger", "Switch", "Textarea"]);

function getElementName(type: unknown) {
  if (typeof type === "string") return type;
  if (typeof type !== "function" && typeof type !== "object") return "";
  const named = type as { displayName?: string; name?: string };
  return named.displayName || named.name || "";
}

function mergeIds(...ids: Array<unknown>) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function attachFieldA11y(
  node: React.ReactNode,
  ids: { controlId: string; labelId: string; describedBy?: string; invalid?: boolean; required?: boolean },
  state: { attached: boolean; attachedId?: string },
): React.ReactNode {
  return React.Children.map(node, child => {
    if (!React.isValidElement(child)) return child;

    const element = child as React.ReactElement<Record<string, unknown>>;
    const name = getElementName(element.type);
    const childProps = element.props;

    if (!state.attached && FIELD_CONTROL_NAMES.has(name)) {
      const attachedId = typeof childProps.id === "string" ? childProps.id : ids.controlId;
      state.attached = true;
      state.attachedId = attachedId;
      return React.cloneElement(element, {
        id: attachedId,
        "aria-labelledby": childProps["aria-labelledby"] ?? ids.labelId,
        "aria-describedby": mergeIds(childProps["aria-describedby"], ids.describedBy),
        "aria-invalid": childProps["aria-invalid"] ?? (ids.invalid || undefined),
        "aria-required": childProps["aria-required"] ?? (ids.required || undefined),
      });
    }

    if (childProps.children) {
      return React.cloneElement(element, {
        children: attachFieldA11y(childProps.children as React.ReactNode, ids, state),
      });
    }

    return child;
  });
}

/**
 * Sectioned form scaffolding (F-FORM1/2): replaces cramped 2-column modals with
 * titled sections, a 2-col responsive grid, inline help, and a sticky footer for
 * primary/secondary actions incl. "save & add another".
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border pb-5 last:border-0", className)}>
      {(title || description) && (
        <div className="mb-3">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  full,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  const generatedId = React.useId();
  const controlId = htmlFor ?? `field-${generatedId}`;
  const labelId = `${controlId}-label`;
  const messageId = hint || error ? `${controlId}-message` : undefined;
  const state = { attached: false, attachedId: undefined as string | undefined };
  const enhancedChildren = attachFieldA11y(
    children,
    { controlId, labelId, describedBy: messageId, invalid: Boolean(error), required },
    state,
  );
  const labelFor = htmlFor ?? state.attachedId;

  return (
    <div className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <label id={labelId} htmlFor={labelFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {enhancedChildren}
      {hint && !error && <p id={messageId} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={messageId} className="text-xs text-danger-soft-foreground">{error}</p>}
    </div>
  );
}

export function FormFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-2 flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-3 [&_button]:min-h-11 sm:[&_button]:min-h-9">
      {children}
    </div>
  );
}
