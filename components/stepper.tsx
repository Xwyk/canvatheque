import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepperStep = { label: string; done: boolean; enabled: boolean };

/** Étapes numérotées (planche Publier) : faite = coche sarcelle, courante = framboise. */
export function Stepper({
  label,
  steps,
  current,
  onSelect,
}: {
  label: string;
  steps: StepperStep[];
  current: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-wrap gap-x-7 gap-y-3 p-0">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        const marker = (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-full font-extrabold",
                isCurrent && "bg-primary text-primary-foreground",
                !isCurrent && step.done && "bg-success text-white",
                !isCurrent && !step.done && "border-2 border-input font-bold",
              )}
            >
              {!isCurrent && step.done ? <Check className="size-5" strokeWidth={3} /> : index + 1}
            </span>
            <span>{step.label}</span>
          </>
        );
        const tone = isCurrent
          ? "font-extrabold text-foreground"
          : step.done
            ? "font-semibold text-text-secondary"
            : "font-semibold text-muted-foreground";
        return (
          <li key={step.label} aria-current={isCurrent ? "step" : undefined}>
            {onSelect && step.enabled && !isCurrent ? (
              <button
                type="button"
                onClick={() => onSelect(index)}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-full bg-transparent p-0 hover:text-primary",
                  tone,
                )}
              >
                {marker}
              </button>
            ) : (
              <span className={cn("flex min-h-11 items-center gap-2.5", tone)}>{marker}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
