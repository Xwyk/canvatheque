import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/logo";

/** Carte 500 px sur fond lavande (planche Connexion, hors modale). */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-muted px-4 py-10 md:py-16">
      <section
        aria-labelledby="auth-title"
        className="mx-auto flex w-full max-w-[500px] flex-col gap-6 rounded-[28px] bg-card px-5 py-8 shadow-card md:px-10 md:pt-10 md:pb-8"
      >
        <LogoMark className="size-11" />
        <div className="flex flex-col gap-2">
          <h1
            id="auth-title"
            className="m-0 text-[26px] leading-[1.1] font-extrabold tracking-[-0.01em] md:text-[30px]"
          >
            {title}
          </h1>
          {subtitle && <p className="m-0 text-base text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="text-center text-[15px] text-muted-foreground">{footer}</div>}
      </section>
    </div>
  );
}
