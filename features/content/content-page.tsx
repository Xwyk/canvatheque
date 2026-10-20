import { useTranslations } from "next-intl";
import { fillPlaceholders, inlineText } from "@/lib/inline-text";

/** Bloc de contenu : paragraphe, liste à puces ou liste numérotée (pas à pas). */
export type ContentBlock = string | { ul: string[] } | { ol: string[] };

export type ContentSection = { id: string; title: string; blocks: ContentBlock[] };

export type ContentPageKey = "about" | "help" | "legal" | "privacy" | "terms";

export type ContentPageData = {
  title: string;
  description: string;
  intro: string;
  updated?: string;
  sections: ContentSection[];
};

/**
 * Pages de contenu (À propos, Aide, pages légales) : colonne de 720 px, sommaire (latéral
 * à partir de 1024 px). Textes dans `messages/fr/content.json`, valeurs `{…}` remplacées.
 */
export function ContentPage({
  page,
  values = {},
}: {
  page: ContentPageKey;
  values?: Record<string, string>;
}) {
  const t = useTranslations("content");
  const data = t.raw(page) as ContentPageData;
  const text = (value: string) => inlineText(fillPlaceholders(value, values));

  return (
    <div className="container-page grid grid-cols-1 gap-8 py-8 md:py-12 lg:grid-cols-[220px_minmax(0,720px)] lg:gap-12">
      <nav aria-labelledby="toc-title" className="lg:sticky lg:top-24 lg:self-start">
        <p
          id="toc-title"
          className="m-0 mb-3 text-[13px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase"
        >
          {t("toc")}
        </p>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {data.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center text-[15px] font-semibold text-text-secondary hover:text-primary lg:min-h-9"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-start-1">
        <header className="flex flex-col gap-3">
          <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
            {data.title}
          </h1>
          <p className="m-0 text-lg text-text-secondary">{text(data.intro)}</p>
          {data.updated && (
            <p className="m-0 text-[15px] text-muted-foreground">
              {t("updated", { date: data.updated })}
            </p>
          )}
        </header>
        {data.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="flex scroll-mt-24 flex-col gap-3"
          >
            <h2 id={`${section.id}-title`} className="m-0 text-2xl font-bold">
              {section.title}
            </h2>
            {section.blocks.map((block, index) => {
              const key = `${section.id}-${index}`;
              if (typeof block === "string") {
                return (
                  <p key={key} className="m-0 text-text-secondary">
                    {text(block)}
                  </p>
                );
              }
              const ordered = "ol" in block;
              const List = ordered ? "ol" : "ul";
              return (
                <List
                  key={key}
                  className={`m-0 flex flex-col gap-1.5 pl-6 text-text-secondary ${ordered ? "list-decimal" : "list-disc"}`}
                >
                  {(ordered ? block.ol : block.ul).map((item) => (
                    <li key={item}>{text(item)}</li>
                  ))}
                </List>
              );
            })}
          </section>
        ))}
      </article>
    </div>
  );
}
