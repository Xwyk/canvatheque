import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Boutons et liens « pilule » des maquettes. */
const pillButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-2 font-bold whitespace-nowrap no-underline transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover hover:text-primary-foreground",
        outline: "border-ink bg-transparent text-ink hover:bg-muted hover:text-ink",
        highlight:
          "border-highlight bg-highlight text-highlight-foreground hover:text-highlight-foreground hover:brightness-95",
        soft: "border-transparent bg-muted text-foreground hover:bg-border hover:text-foreground",
      },
      size: {
        sm: "min-h-11 px-4 text-[15px]",
        md: "min-h-11 px-5 text-base",
        lg: "min-h-[52px] px-7 text-[17px]",
        xl: "min-h-14 px-7 text-[17px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type PillButtonProps = VariantProps<typeof pillButtonVariants> & { className?: string };

/** Classes fusionnées : une classe passée en `className` remplace celle de la variante. */
export function pillButton({ variant, size, className }: PillButtonProps = {}): string {
  return cn(pillButtonVariants({ variant, size }), className);
}
