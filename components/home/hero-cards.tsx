import { useTranslations } from "next-intl";
import { SHAPES, type ShapeName } from "@/components/shapes";
import { cn } from "@/lib/utils";

type Card = {
  key: "heart" | "butterfly" | "star";
  shape: ShapeName;
  tint: string;
  fill: string;
  position: string;
};

const CARDS: Card[] = [
  {
    key: "heart",
    shape: "heart",
    tint: "bg-tint-rose",
    fill: "fill-[#C81E4B]",
    position: "left-0 top-[50px] w-[46%] -rotate-[7deg] [animation-delay:60ms]",
  },
  {
    key: "butterfly",
    shape: "butterfly",
    tint: "bg-tint-teal",
    fill: "fill-[#0F7C7E]",
    position: "right-0 top-[10px] w-[48%] rotate-[5deg] [animation-delay:140ms]",
  },
  {
    key: "star",
    shape: "star",
    tint: "bg-tint-yellow",
    fill: "fill-[#F5B82E]",
    position: "left-[24%] top-[215px] w-1/2 -rotate-2 [animation-delay:220ms]",
  },
];

/** Illustration décorative du hero : trois cartes inclinées (masquée aux lecteurs d'écran). */
export function HeroCards({ className }: { className?: string }) {
  const t = useTranslations("home.heroCards");
  return (
    <div aria-hidden="true" className={cn("relative h-[440px]", className)}>
      {CARDS.map((card) => (
        <div
          key={card.key}
          className={cn(
            "absolute animate-in rounded-3xl bg-card p-2.5 shadow-float duration-500 fill-mode-both fade-in slide-in-from-bottom-4",
            card.position,
          )}
        >
          <div
            className={cn("flex aspect-square items-center justify-center rounded-2xl", card.tint)}
          >
            <svg viewBox="0 0 100 100" className={cn("size-3/5", card.fill)}>
              <path d={SHAPES[card.shape]} />
            </svg>
          </div>
          <div className="px-1 pt-2.5 pb-0.5 text-[15px] font-bold text-foreground">
            {t(card.key)}
          </div>
        </div>
      ))}
    </div>
  );
}
