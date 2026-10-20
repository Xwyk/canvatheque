import { ArrowLeft, EyeOff, FilePen } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { FormatBadge, ModelGrid } from "@/components/model-card";
import {
  DownloadPanel,
  MobileActionBar,
} from "@/features/catalog/components/model-page/download-actions";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { OwnerActions } from "@/features/catalog/components/model-page/owner-actions";
import { ShareButton } from "@/features/catalog/components/model-page/share-button";
import { ZoomablePreview } from "@/features/catalog/components/model-page/zoomable-preview";
import type { ModelPageData } from "@/features/catalog/model-page";
import type { CatalogItem } from "@/features/catalog/search";
import type { ClientOs } from "@/features/downloads/links";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import { cn } from "@/lib/utils";

const tagHref = (tag: string) => `/models?tag=${encodeURIComponent(tag)}`;

function Breadcrumb({ data }: { data: ModelPageData }) {
  const t = useTranslations("modelPage");
  const linkClass = "inline-flex min-h-9 items-center text-muted-foreground hover:text-primary";
  return (
    <nav aria-label={t("breadcrumb")} className="pt-2 pb-5 text-[15px] max-md:hidden">
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0">
        <li className="inline-flex items-center gap-2">
          <Link href="/models" className={linkClass}>
            {t("breadcrumbModels")}
          </Link>
          <span aria-hidden="true">/</span>
        </li>
        {data.category && (
          <li className="inline-flex items-center gap-2">
            <Link href={`/categories/${data.category.slug}`} className={linkClass}>
              {data.category.name}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
        )}
        <li>
          <span aria-current="page" className="font-semibold text-foreground">
            {data.model.title}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/** Bandeau d'état pour l'auteur : masqué par la modération (ambre) ou brouillon (neutre). */
function StatusBanner({ data }: { data: ModelPageData }) {
  const t = useTranslations("modelPage");
  const { status, hiddenReason } = data.model;
  if (status === "PUBLISHED") return null;
  const hidden = status === "HIDDEN";
  const Icon = hidden ? EyeOff : FilePen;
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex items-start gap-3 rounded-[20px] px-5 py-4",
        hidden ? "bg-highlight-soft text-foreground" : "bg-muted text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <strong>{hidden ? t("hiddenTitle") : t("draftTitle")}</strong>
        <span className="text-[15px] text-text-secondary">
          {hidden ? t("hiddenText") : t("draftText")}
        </span>
        {hidden && hiddenReason && (
          <span className="text-[15px] text-text-secondary">
            {t("hiddenReason", { reason: hiddenReason })}
          </span>
        )}
      </div>
    </div>
  );
}

function AuthorLine({ data }: { data: ModelPageData }) {
  const t = useTranslations("modelPage");
  const tCard = useTranslations("modelCard");
  const format = useFormatter();
  const { author, model } = data;
  const content = (
    <>
      <Avatar pseudo={author.pseudo} className="size-8 text-sm md:size-10 md:text-base" />
      <span className="max-md:hidden">
        <strong className="text-foreground">{author.pseudo}</strong>
        {model.publishedAt && (
          <>
            <br />
            <span className="text-sm">
              {t("publishedOn", {
                date: format.dateTime(model.publishedAt, { dateStyle: "long" }),
              })}
            </span>
          </>
        )}
      </span>
      <span className="text-[15px] md:hidden">
        {t.rich("by", {
          pseudo: author.pseudo,
          strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
        })}
        {" · "}
        {tCard("downloads", { count: model.downloadCount })}
      </span>
    </>
  );
  const className =
    "inline-flex min-h-11 items-center gap-2.5 self-start text-text-secondary no-underline md:gap-3";
  return author.hasProfile ? (
    <Link href={`/members/${author.pseudoSlug}`} className={cn(className, "hover:text-primary")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function InfoPanel({ data }: { data: ModelPageData }) {
  const t = useTranslations("modelPage");
  const tLicense = useTranslations("licenses");
  const format = useFormatter();
  const { model, category, tags } = data;
  return (
    <dl className="m-0 flex flex-col gap-4 rounded-[24px] bg-muted p-6">
      <div>
        <dt className="section-label">{t("category")}</dt>
        <dd className="m-0 mt-0.5 font-semibold">
          {category ? (
            <Link href={`/categories/${category.slug}`} className="text-foreground">
              {category.name}
            </Link>
          ) : (
            t("noCategory")
          )}
        </dd>
      </div>
      <div>
        <dt className="section-label">{t("license")}</dt>
        <dd className="m-0 mt-0.5 font-semibold">
          {model.license ? (
            <>
              {tLicense(`${model.license}.name`)}
              <br />
              <span className="text-[15px] font-normal text-text-secondary">
                {tLicense(`${model.license}.summary`)}
              </span>
            </>
          ) : (
            t("noLicense")
          )}
        </dd>
      </div>
      {tags.length > 0 && (
        <div>
          <dt className="section-label">{t("tags")}</dt>
          <dd className="m-0 mt-2">
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={tagHref(tag)}
                    className="inline-flex min-h-11 items-center rounded-full bg-background px-3.5 text-[15px] font-semibold text-foreground no-underline hover:text-primary"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      <div>
        <dt className="section-label">{t("downloads")}</dt>
        <dd className="m-0 mt-0.5 font-semibold">{format.number(model.downloadCount)}</dd>
      </div>
    </dl>
  );
}

function ModelSection({
  id,
  title,
  items,
  action,
}: {
  id: string;
  title: string;
  items: CatalogItem[];
  action?: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-7 pt-14 md:pt-[72px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id} className="m-0 text-[26px] font-bold tracking-[-0.01em] md:text-[32px]">
          {title}
        </h2>
        {action}
      </div>
      <ModelGrid>
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <CatalogCard item={item} />
          </li>
        ))}
      </ModelGrid>
    </section>
  );
}

/** Fiche d'un modèle (planches Fiche et MobileFiche). */
export function ModelView({
  data,
  similar,
  authorModels,
  canonicalUrl,
  favorited = false,
  os,
}: {
  data: ModelPageData;
  similar: CatalogItem[];
  authorModels: CatalogItem[];
  canonicalUrl: string;
  /** Modèle dans les favoris du membre connecté. */
  favorited?: boolean;
  os: ClientOs;
}) {
  const t = useTranslations("modelPage");
  const { model, author, preview } = data;
  const sizeLabel = model.fileSizeLabel;
  // Nom du fichier enregistré (en-tête Content-Disposition du téléchargement).
  const fileName = `${model.slug}.${model.format === "SVG" ? "svg" : "cwprj"}`;

  return (
    <div className={cn("container-page pb-16", sizeLabel && "max-md:pb-40")}>
      {/* En-tête réduit mobile : retour, partager. */}
      <div className="-mx-3 flex h-16 items-center justify-between md:hidden">
        <Link
          href="/models"
          aria-label={t("back")}
          className="inline-flex size-12 items-center justify-center rounded-full text-foreground hover:bg-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-6" />
        </Link>
        <div className="flex">
          {model.status === "PUBLISHED" && (
            <FavoriteButton
              variant="icon"
              modelId={model.id}
              title={model.title}
              favorited={favorited}
              className="size-12"
            />
          )}
          <ShareButton variant="icon" title={model.title} url={canonicalUrl} />
        </div>
      </div>
      <Breadcrumb data={data} />
      <StatusBanner data={data} />

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] md:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
        <section aria-label={t("previewSection")} className="min-w-0">
          <ZoomablePreview
            preview={preview}
            alt={t("previewAlt", { title: model.title })}
            emptyLabel={t("previewNone")}
          />
        </section>

        <aside aria-label={t("infoSection")} className="flex min-w-0 flex-col gap-6 md:row-span-2">
          <div className="flex flex-col gap-3 md:gap-3.5">
            <FormatBadge format={model.format} className="self-start px-3" />
            <h1 className="m-0 text-[32px] leading-[1.08] font-extrabold tracking-[-0.02em] break-words md:text-[clamp(32px,4vw,44px)]">
              {model.title}
            </h1>
            <AuthorLine data={data} />
          </div>

          {sizeLabel && (
            <div className="max-md:hidden">
              <DownloadPanel
                slug={model.slug}
                format={model.format}
                sizeLabel={sizeLabel}
                fileName={fileName}
                os={os}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {model.status === "PUBLISHED" && (
              <FavoriteButton
                variant="pill"
                modelId={model.id}
                title={model.title}
                favorited={favorited}
                className="max-md:hidden"
              />
            )}
            <ShareButton title={model.title} url={canonicalUrl} className="max-md:hidden" />
            {data.canEdit && (
              <OwnerActions modelId={model.id} slug={model.slug} title={model.title} />
            )}
          </div>

          <InfoPanel data={data} />
        </aside>

        <section aria-labelledby="about" className="flex min-w-0 flex-col gap-3 md:pt-2">
          <h2 id="about" className="m-0 text-[22px] font-bold md:text-[26px]">
            {t("about")}
          </h2>
          {data.descriptionHtml ? (
            <div
              className="max-w-[640px] text-text-secondary [&_a]:font-semibold [&_a]:text-primary [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-0 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
              // HTML issu de renderMarkdown : liste blanche DOMPurify (lib/security/markdown).
              dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
            />
          ) : (
            <p className="m-0 text-muted-foreground">{t("noDescription")}</p>
          )}
        </section>
      </div>

      <ModelSection id="similar" title={t("similar")} items={similar} />
      <ModelSection
        id="author-models"
        title={t("authorModels", { pseudo: author.pseudo })}
        items={authorModels}
        action={
          author.hasProfile ? (
            <Link
              href={`/members/${author.pseudoSlug}`}
              className="inline-flex min-h-11 items-center font-bold"
            >
              {t("seeProfile")}
            </Link>
          ) : undefined
        }
      />

      {sizeLabel && (
        <MobileActionBar
          slug={model.slug}
          format={model.format}
          sizeLabel={sizeLabel}
          fileName={fileName}
        />
      )}
    </div>
  );
}
