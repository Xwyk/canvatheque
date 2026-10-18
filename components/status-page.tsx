import type { ReactNode } from "react";
import { SHAPES } from "@/components/shapes";

/** Illustration des pages 404 / erreur : formes des maquettes (étoile, cœur, papillon). */
export function StatusIllustration() {
  return (
    <svg viewBox="0 0 240 140" aria-hidden="true" className="h-auto w-56 md:w-64">
      <g transform="translate(6 34) rotate(-10 40 40) scale(0.8)">
        <path d={SHAPES.heart} className="fill-primary" />
      </g>
      <g transform="translate(78 0) scale(0.9)">
        <path d={SHAPES.butterfly} className="fill-success" />
      </g>
      <g transform="translate(160 44) rotate(12 40 40) scale(0.75)">
        <path d={SHAPES.star} className="fill-highlight" />
      </g>
    </svg>
  );
}

export function StatusPage({
  title,
  text,
  actions,
  footnote,
}: {
  title: string;
  text: string;
  actions: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <section className="container-page flex flex-col items-center gap-6 py-16 text-center md:py-24">
      <StatusIllustration />
      <h1 className="m-0 text-[clamp(32px,4.5vw,48px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
        {title}
      </h1>
      <p className="m-0 max-w-[520px] text-base text-muted-foreground md:text-lg">{text}</p>
      <div className="flex flex-wrap justify-center gap-3">{actions}</div>
      {footnote}
    </section>
  );
}
