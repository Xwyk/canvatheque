import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import type { ReactElement, ReactNode } from "react";
import { messages } from "@/messages";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: Providers, ...options });
}
