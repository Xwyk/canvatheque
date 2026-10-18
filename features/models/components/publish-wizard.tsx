"use client";

import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { FieldShell, inputClass, TextField } from "@/components/forms/text-field";
import { ModelCard } from "@/components/model-card";
import { Stepper } from "@/components/stepper";
import { pillButton } from "@/components/ui/pill-button";
import { publishModelAction, saveModelAction, suggestTagsAction } from "@/features/models/actions";
import { DescriptionField } from "@/features/models/components/description-field";
import { LicenseField } from "@/features/models/components/license-field";
import { PreviewFrame } from "@/features/models/components/preview-frame";
import { TagInput } from "@/features/models/components/tag-input";
import type { LicenseValue } from "@/features/models/schemas";
import type { EditableModel } from "@/features/models/service";
import { CropDialog } from "@/features/uploads/components/crop-dialog";
import { Dropzone } from "@/features/uploads/components/dropzone";
import { UploadStatus } from "@/features/uploads/components/upload-status";
import type { ConfirmedFile, ConfirmedPreview } from "@/features/uploads/service";
import { useUpload } from "@/features/uploads/use-upload";
import { formatFileSize } from "@/lib/format";
import type { Crop } from "@/lib/images/preview";
import type { ActionError } from "@/lib/result";
import { renderMarkdownInBrowser } from "@/lib/security/markdown-client";
import { cn } from "@/lib/utils";

export type WizardCategory = { id: string; name: string };

type Details = {
  title: string;
  description: string;
  categoryId: string | null;
  license: LicenseValue | null;
  tags: string[];
};

const STEP_KEYS = ["file", "preview", "info", "review"] as const;
const PREVIEW_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const PREVIEW_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

function detailsOf(model: EditableModel | null): Details {
  return {
    title: model?.title ?? "",
    description: model?.description ?? "",
    categoryId: model?.categoryId ?? null,
    license: model?.license ?? null,
    tags: model?.tags ?? [],
  };
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "warning" | "error" | "success";
  children: ReactNode;
}) {
  const Icon = { info: Info, warning: TriangleAlert, error: CircleAlert, success: Check }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[15px] font-semibold",
        tone === "info" && "bg-muted text-foreground",
        tone === "warning" && "bg-highlight-soft text-foreground",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "success" && "bg-success-soft text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** « Brouillon enregistré à l'instant », puis « il y a n minutes ». */
function SavedStatus({ savedAt, published }: { savedAt: number | null; published: boolean }) {
  const t = useTranslations("publish");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (savedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [savedAt]);
  // `now` peut précéder un enregistrement tout juste fait : la différence négative vaut « à l'instant ».
  const minutes = savedAt === null ? 0 : Math.floor((now - savedAt) / 60_000);
  return (
    <span
      role="status"
      className="inline-flex min-h-6 items-center gap-2 text-[15px] text-text-secondary"
    >
      {savedAt !== null && (
        <>
          <Check aria-hidden="true" className="size-[18px] text-success" strokeWidth={2.6} />
          {published ? t("changesSaved") : minutes < 1 ? t("savedNow") : t("savedAgo", { minutes })}
        </>
      )}
    </span>
  );
}

/**
 * Assistant de publication en 4 étapes (planche Publier) : fichier, aperçu, informations,
 * relecture. Le brouillon existe dès le premier fichier confirmé ; chaque passage par
 * « Continuer » enregistre les informations. En modification, le stepper est libre.
 */
export function PublishWizard({
  initial,
  categories,
  authorPseudo,
  emailVerified,
  maxFileMb,
  quotaReached = false,
  maxModels,
}: {
  initial: EditableModel | null;
  categories: WizardCategory[];
  authorPseudo: string;
  emailVerified: boolean;
  maxFileMb: number;
  quotaReached?: boolean;
  maxModels: number;
}) {
  const t = useTranslations("publish");
  const tRoot = useTranslations();
  const ids = useId();
  const [model, setModel] = useState<EditableModel | null>(initial);
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<Details>(() => detailsOf(initial));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<ActionError | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ slug: string; title: string } | null>(null);
  const [certify, setCertify] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const fileUpload = useUpload<ConfirmedFile>();
  const previewUpload = useUpload<ConfirmedPreview>();

  const isPublished = model?.status === "PUBLISHED";
  const isHidden = model?.status === "HIDDEN";
  const category = categories.find((item) => item.id === details.categoryId);
  const descriptionHtml = useMemo(
    () => (step === 3 ? renderMarkdownInBrowser(details.description) : ""),
    [step, details.description],
  );

  const steps = STEP_KEYS.map((key, index) => ({
    label: t(`steps.${key}`),
    done:
      index === 0
        ? !!model?.fileName
        : index === 1
          ? !!model?.preview
          : index === 2
            ? !!(model && details.categoryId && details.license && details.title)
            : isPublished,
    enabled: index === 0 || !!model,
  }));

  // --- Enregistrement --------------------------------------------------------------------

  const save = async (): Promise<boolean> => {
    if (!model) return false;
    setError(null);
    const result = await saveModelAction({ modelId: model.id, ...details });
    if (!result.ok) {
      setFields(result.error.fields ?? {});
      setError(result.error);
      return false;
    }
    setFields({});
    setDetails((current) => ({ ...current, tags: result.data.tags }));
    setModel(
      (current) =>
        current && {
          ...current,
          ...details,
          tags: result.data.tags,
          updatedAt: result.data.updatedAt,
        },
    );
    setSavedAt(Date.now());
    return true;
  };

  const goTo = (target: number) => {
    setNotice(null);
    startTransition(async () => {
      // Quitter l'étape Informations enregistre le brouillon.
      if (step === 2 && target !== 2 && !(await save())) return;
      setError(null);
      setStep(target);
      document.getElementById("publish-heading")?.focus();
    });
  };

  // --- Fichier et aperçu --------------------------------------------------------------------

  const onModelFile = async (file: File) => {
    setError(null);
    setDuplicate(null);
    const result = await fileUpload.start(file, { kind: "MODEL", modelId: model?.id });
    if (!result) return;
    setDuplicate(result.duplicateOf);
    setModel((current) => {
      const base: EditableModel = current ?? {
        id: result.modelId,
        slug: result.slug,
        status: "DRAFT",
        format: result.format,
        fileName: null,
        fileSize: null,
        title: "",
        description: "",
        categoryId: null,
        license: null,
        tags: [],
        preview: null,
        previewCustom: false,
        publishedAt: null,
        updatedAt: new Date().toISOString(),
        authorPseudo,
      };
      return {
        ...base,
        format: result.format,
        fileName: result.fileName,
        fileSize: result.fileSize,
        preview: result.preview,
        previewCustom: result.previewCustom,
      };
    });
    if (result.created) {
      // Le brouillon a désormais une adresse : un rechargement le retrouve.
      setDetails((current) => ({ ...current, title: current.title || result.title }));
      window.history.replaceState(null, "", `/models/${result.slug}/edit`);
      setSavedAt(Date.now());
    }
  };

  const onPreviewFile = (file: File) => {
    if (!PREVIEW_TYPES.has(file.type)) {
      previewUpload.reset();
      setError({ code: "VALIDATION", message: "errors.upload.imageType" });
      return;
    }
    if (file.size > PREVIEW_MAX_BYTES) {
      setError({ code: "VALIDATION", message: "errors.upload.imageTooLarge" });
      return;
    }
    setError(null);
    setCropFile(file);
  };

  const uploadPreview = async (file: File, crop: Crop | undefined) => {
    setCropFile(null);
    if (!model) return;
    const result = await previewUpload.start(file, { kind: "PREVIEW", modelId: model.id }, crop);
    if (result) {
      setModel(
        (current) => current && { ...current, preview: result.preview, previewCustom: true },
      );
      setSavedAt(Date.now());
    }
  };

  // --- Publication ---------------------------------------------------------------------------

  const publish = () => {
    if (!model) return;
    setError(null);
    startTransition(async () => {
      if (!(await save())) {
        setStep(2);
        return;
      }
      // En cas de succès, l'action redirige vers « Mes modèles ».
      const result = await publishModelAction({ modelId: model.id, certifyRights: certify });
      if (result && !result.ok) {
        setFields(result.error.fields ?? {});
        setError(result.error);
        const missing = result.error.fields ?? {};
        if (missing.categoryId || missing.license) setStep(2);
        else if (missing.preview) setStep(1);
        else if (missing.file) setStep(0);
      }
    });
  };

  const saveOnly = () => {
    startTransition(async () => {
      if (await save()) setNotice(isPublished ? "changesSaved" : "review.draftSaved");
    });
  };

  // --- Rendu ---------------------------------------------------------------------------------

  const errorMessage =
    error &&
    (error.code === "RATE_LIMITED"
      ? tRoot("errors.rateLimited", {
          minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)),
        })
      : tRoot.has(error.message)
        ? tRoot(error.message)
        : tRoot("errors.generic"));

  const navigation = (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
      {step > 0 ? (
        <button
          type="button"
          onClick={() => goTo(step - 1)}
          disabled={pending}
          className={pillButton({ variant: "outline", size: "lg" })}
        >
          {t("back")}
        </button>
      ) : (
        <span />
      )}
      {step < 3 && (
        <button
          type="button"
          onClick={() => goTo(step + 1)}
          disabled={pending || !model || (step === 1 && !model.preview)}
          className={pillButton({ size: "lg", className: "px-8 font-extrabold" })}
        >
          {pending ? t("saving") : t("continue")}
        </button>
      )}
    </div>
  );

  return (
    <div className="container-page flex flex-col pb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pt-6 pb-2">
        <h1
          id="publish-heading"
          tabIndex={-1}
          className="m-0 text-[clamp(32px,4.2vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em] outline-none"
        >
          {initial ? t("editTitle") : t("title")}
        </h1>
        <SavedStatus savedAt={savedAt} published={isPublished} />
      </div>

      <div className="pt-6 pb-8">
        <Stepper label={t("stepsLabel")} steps={steps} current={step} onSelect={goTo} />
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <section
          aria-labelledby={`${ids}-step`}
          className="flex min-w-0 flex-[1_1_520px] flex-col gap-6"
        >
          {!emailVerified && <Notice tone="info">{t("unverified")}</Notice>}
          {errorMessage && <Notice tone="error">{errorMessage}</Notice>}

          {step === 0 && (
            <>
              <StepHeading id={`${ids}-step`} title={t("file.heading")} text={t("file.text")} />
              {quotaReached && !model ? (
                <Notice tone="warning">{t("quotaReached", { max: maxModels })}</Notice>
              ) : (
                <Dropzone
                  title={model?.fileName ? t("file.replaceTitle") : t("file.dropTitle")}
                  hint={t("file.dropHint", { max: maxFileMb })}
                  buttonLabel={t("file.choose")}
                  accept=".cwprj,.svg,image/svg+xml"
                  disabled={
                    fileUpload.state.phase === "uploading" ||
                    fileUpload.state.phase === "processing"
                  }
                  onFile={onModelFile}
                />
              )}
              <UploadStatus state={fileUpload.state} onCancel={fileUpload.cancel} />
              {model?.fileName && fileUpload.state.phase === "idle" && (
                <Notice tone="success">{t("file.checked", { name: model.fileName })}</Notice>
              )}
              {duplicate && (
                <Notice tone="warning">{t("file.duplicate", { title: duplicate.title })}</Notice>
              )}
            </>
          )}

          {step === 1 && model && (
            <>
              <StepHeading
                id={`${ids}-step`}
                title={t("preview.heading")}
                text={
                  model.previewCustom
                    ? t("preview.textCustom")
                    : model.format === "SVG"
                      ? t("preview.textSvg")
                      : t("preview.textCwprj")
                }
              />
              {model.preview && (
                <PreviewFrame
                  preview={model.preview}
                  alt={t("preview.alt", { title: details.title || model.title })}
                  emptyLabel={t("preview.none")}
                />
              )}
              <Dropzone
                title={model.preview ? t("preview.replaceTitle") : t("preview.dropTitle")}
                hint={t("preview.dropHint")}
                buttonLabel={t("preview.choose")}
                accept={PREVIEW_ACCEPT}
                disabled={
                  previewUpload.state.phase === "uploading" ||
                  previewUpload.state.phase === "processing"
                }
                onFile={onPreviewFile}
              />
              <UploadStatus state={previewUpload.state} onCancel={previewUpload.cancel} />
              <CropDialog
                file={cropFile}
                onCancel={() => setCropFile(null)}
                onConfirm={(crop) => cropFile && uploadPreview(cropFile, crop)}
              />
            </>
          )}

          {step === 2 && model && (
            <>
              <StepHeading id={`${ids}-step`} title={t("info.heading")} />
              <TextField
                name="title"
                label={t("info.title")}
                value={details.title}
                maxLength={80}
                required
                error={fields.title}
                onChange={(event) => setDetails({ ...details, title: event.target.value })}
              />
              <DescriptionField
                id={`${ids}-description`}
                value={details.description}
                error={fields.description}
                onChange={(description) => setDetails({ ...details, description })}
              />
              <FieldShell
                id={`${ids}-category`}
                label={t("info.category")}
                error={fields.categoryId}
              >
                {(describedBy) => (
                  <select
                    id={`${ids}-category`}
                    value={details.categoryId ?? ""}
                    aria-invalid={fields.categoryId ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) =>
                      setDetails({ ...details, categoryId: event.target.value || null })
                    }
                    className={inputClass}
                  >
                    <option value="">{t("info.categoryPlaceholder")}</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
              </FieldShell>
              <TagInput
                id={`${ids}-tags`}
                tags={details.tags}
                error={fields.tags}
                suggest={suggestTagsAction}
                onChange={(tags) => setDetails({ ...details, tags })}
              />
              <LicenseField
                value={details.license}
                error={fields.license}
                onChange={(license) => setDetails({ ...details, license })}
              />
            </>
          )}

          {step === 3 && model && (
            <>
              <StepHeading id={`${ids}-step`} title={t("review.heading")} />
              {isPublished && <Notice tone="info">{t("review.publishedNotice")}</Notice>}
              {isHidden && <Notice tone="warning">{t("review.hiddenNotice")}</Notice>}
              <dl className="m-0 grid gap-x-6 gap-y-3 rounded-[20px] bg-muted p-5 sm:grid-cols-[160px_1fr]">
                <ReviewItem label={t("review.file")}>
                  {model.fileName}
                  {model.fileSize !== null && ` · ${formatFileSize(model.fileSize)}`}
                </ReviewItem>
                <ReviewItem label={t("review.title")}>{details.title}</ReviewItem>
                <ReviewItem label={t("review.category")}>
                  {category?.name ?? t("review.none")}
                </ReviewItem>
                <ReviewItem label={t("review.license")}>
                  {details.license ? tRoot(`licenses.${details.license}.name`) : t("review.none")}
                </ReviewItem>
                <ReviewItem label={t("review.tags")}>
                  {details.tags.length > 0 ? details.tags.join(", ") : t("review.none")}
                </ReviewItem>
                <ReviewItem label={t("review.description")}>
                  {details.description ? (
                    <div
                      className="flex flex-col gap-2 [&_a]:font-semibold [&_ol]:m-0 [&_p]:m-0 [&_ul]:m-0"
                      // HTML produit par marked puis nettoyé par DOMPurify (liste blanche courte).
                      dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                    />
                  ) : (
                    t("review.none")
                  )}
                </ReviewItem>
              </dl>
              {notice && <Notice tone="success">{t(notice)}</Notice>}
              {model.status === "DRAFT" && (
                <label className="flex cursor-pointer items-start gap-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={certify}
                    onChange={(event) => setCertify(event.target.checked)}
                    aria-invalid={fields.certifyRights ? true : undefined}
                    className="mt-0.5 size-[22px] shrink-0 accent-primary"
                  />
                  <span>
                    {t("review.certify")}
                    {fields.certifyRights && (
                      <span className="block text-sm text-destructive">
                        {tRoot(`errors.field.${fields.certifyRights}`)}
                      </span>
                    )}
                  </span>
                </label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goTo(2)}
                  disabled={pending}
                  className={pillButton({ variant: "outline", size: "lg" })}
                >
                  {t("back")}
                </button>
                <div className="flex flex-wrap gap-3">
                  {model.status === "DRAFT" ? (
                    <>
                      <button
                        type="button"
                        onClick={saveOnly}
                        disabled={pending}
                        className={pillButton({ variant: "outline", size: "lg" })}
                      >
                        {t("review.saveDraft")}
                      </button>
                      <button
                        type="button"
                        onClick={publish}
                        disabled={pending || !emailVerified || !certify}
                        className={pillButton({ size: "lg", className: "px-8 font-extrabold" })}
                      >
                        {pending ? t("review.publishing") : t("review.publish")}
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/me" className={pillButton({ variant: "outline", size: "lg" })}>
                        {t("review.toMyModels")}
                      </Link>
                      <button
                        type="button"
                        onClick={saveOnly}
                        disabled={pending}
                        className={pillButton({ size: "lg", className: "px-8 font-extrabold" })}
                      >
                        {t("review.saveChanges")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {step < 3 && navigation}
        </section>

        <aside
          aria-label={t("recapLabel")}
          className="flex max-w-[420px] min-w-0 flex-[1_1_320px] flex-col gap-5"
        >
          {model?.fileName && (
            <div className="flex items-center gap-3.5 rounded-[20px] bg-success-soft p-5">
              <span
                aria-hidden="true"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-success"
              >
                <Check className="size-[22px] text-white" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <strong className="block truncate">{model.fileName}</strong>
                <span className="text-sm text-text-secondary">
                  {t("fileValid", { size: formatFileSize(model.fileSize ?? 0) })}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <span className="section-label">{t("galleryPreview")}</span>
            <ModelCard
              model={{
                title: details.title || t("titlePlaceholder"),
                authorPseudo,
                format: model?.format ?? "CWPRJ",
                preview: model?.preview ?? null,
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepHeading({ id, title, text }: { id: string; title: string; text?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={id} className="m-0 text-[28px] leading-tight font-bold">
        {title}
      </h2>
      {text && <p className="m-0 max-w-[560px] text-text-secondary">{text}</p>}
    </div>
  );
}

function ReviewItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-bold">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-text-secondary">{children}</dd>
    </>
  );
}
