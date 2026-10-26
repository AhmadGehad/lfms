import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Match control components by identity, not by function name: production builds
// minify names, which silently dropped the label/aria wiring there.
const FIELD_CONTROL_TAGS = new Set(["input", "select", "textarea"]);
const FIELD_CONTROL_COMPONENTS = new Set<unknown>([Input, SelectTrigger, Switch, Textarea]);

function isFieldControl(type: unknown) {
  return typeof type === "string" ? FIELD_CONTROL_TAGS.has(type) : FIELD_CONTROL_COMPONENTS.has(type);
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
    const childProps = element.props;

    if (!state.attached && isFieldControl(element.type)) {
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

/** Value of the first control in a field (Select root or input), if any. */
function findControlValue(node: React.ReactNode): { found: boolean; value?: unknown } {
  let result: { found: boolean; value?: unknown } = { found: false };
  React.Children.forEach(node, child => {
    if (result.found || !React.isValidElement(child)) return;
    const props = child.props as Record<string, unknown>;
    if ("value" in props) { result = { found: true, value: props.value }; return; }
    if (props.children) result = findControlValue(props.children as React.ReactNode);
  });
  return result;
}

const isEmptyValue = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Number of failed submit attempts; 0 hides inline "Required" messages. */
const FormValidationContext = React.createContext(0);

/**
 * Wrap a form's fields and bump `attempt` when a submit fails validation:
 * every required FormField whose control is still empty then shows an inline
 * "Required" message and red border, and focus moves to the first one.
 */
export function FormValidation({ attempt, className = "contents", children }: { attempt: number; className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (attempt > 0) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  return (
    <FormValidationContext.Provider value={attempt}>
      <div ref={ref} className={className}>{children}</div>
    </FormValidationContext.Provider>
  );
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
  positive,
  full,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Numeric field that must be more than 0 (amounts, quantities). */
  positive?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const attempt = React.useContext(FormValidationContext);
  // Text inputs also validate on blur. Selects are skipped: their trigger blurs as the list opens.
  const [blurred, setBlurred] = React.useState(false);
  const control: { found: boolean; value?: unknown } = required || positive ? findControlValue(children) : { found: false };
  const empty = control.found && isEmptyValue(control.value);
  // A filled field cleared by a form reset ("save & add another") starts fresh.
  const wasEmpty = React.useRef(empty);
  React.useEffect(() => {
    if (empty && !wasEmpty.current) setBlurred(false);
    wasEmpty.current = empty;
  }, [empty]);
  if (!error && (attempt > 0 || blurred) && required && empty) error = t("common.requiredShort", "Required");
  else if (!error && (attempt > 0 || blurred) && positive && control.found && !empty && !(Number.parseFloat(String(control.value)) > 0)) {
    error = t("common.mustBePositive", "Must be more than 0");
  }
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
    <div
      className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}
      onBlur={required || positive ? e => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) setBlurred(true); } : undefined}
    >
      <label id={labelId} htmlFor={labelFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ms-0.5 text-danger">*</span>}
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
