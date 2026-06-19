import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MAX_ANIMAL_ID_LENGTH, normalizeAnimalIdNumber } from "@shared/animalIds";
import { useEffect } from "react";

type AnimalIdNumberFieldProps = {
  inputId: string;
  label: string;
  hint: string;
  placeholder: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function AnimalIdNumberField({
  inputId,
  label,
  hint,
  placeholder,
  prefix,
  value,
  onChange,
  className,
}: AnimalIdNumberFieldProps) {
  const hintId = `${inputId}-hint`;
  const prefixId = `${inputId}-prefix`;
  const maxLength = Math.max(1, MAX_ANIMAL_ID_LENGTH - prefix.length);

  useEffect(() => {
    const normalized = normalizeAnimalIdNumber(value, prefix);
    if (normalized !== value) onChange(normalized);
  }, [onChange, prefix, value]);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <span
          id={prefixId}
          className="flex min-w-12 items-center border-r bg-muted px-3 font-mono text-sm text-muted-foreground"
        >
          {prefix || "—"}
        </span>
        <Input
          id={inputId}
          name="animalIdNumber"
          value={value}
          onChange={(event) => onChange(normalizeAnimalIdNumber(event.target.value, prefix))}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-describedby={`${prefixId} ${hintId}`}
          className="border-0 font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
