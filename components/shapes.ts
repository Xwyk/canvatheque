/** Formes décoratives des maquettes (viewBox 0 0 100 100). */
export const SHAPES = {
  star: "M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z",
  heart: "M50 88 C10 58 6 30 28 20 C40 15 50 24 50 32 C50 24 60 15 72 20 C94 30 90 58 50 88 Z",
  butterfly:
    "M50 30 C30 5 6 15 10 40 C12 55 30 55 42 52 C28 60 24 80 40 88 C48 90 50 78 50 70 C50 78 52 90 60 88 C76 80 72 60 58 52 C70 55 88 55 90 40 C94 15 70 5 50 30 Z",
  leaf: "M15 85 C10 40 40 12 88 12 C90 60 60 90 15 85 Z",
} as const;

export type ShapeName = keyof typeof SHAPES;

/** Étoile du pictogramme (dans un cercle de rayon 46). */
export const LOGO_STAR = "M50 18 L59 40 L82 40 L63 54 L70 77 L50 63 L30 77 L37 54 L18 40 L41 40 Z";
