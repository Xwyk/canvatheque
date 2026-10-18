"use client";

import { EllipsisVertical, EyeOff, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModelCard } from "@/components/model-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteModelAction, unpublishModelAction } from "@/features/models/actions";
import type { MyModel } from "@/features/models/service";
import type { ModelStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ModelStatus, string> = {
  DRAFT: "bg-background text-foreground",
  PUBLISHED: "bg-success text-white",
  HIDDEN: "bg-highlight text-highlight-foreground",
};

/** Liste « Mes modèles » : badges d'état et menu Modifier / Dépublier / Supprimer. */
export function MyModels({ models, authorPseudo }: { models: MyModel[]; authorPseudo: string }) {
  const t = useTranslations("me");
  const tStatus = useTranslations("status");
  const tRoot = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<MyModel | null>(null);

  const report = (message: string): void => {
    toast.error(tRoot.has(message) ? tRoot(message) : tRoot("errors.generic"));
  };

  const unpublish = (model: MyModel) =>
    startTransition(async () => {
      const result = await unpublishModelAction({ modelId: model.id });
      if (!result.ok) return report(result.error.message);
      toast.success(t("unpublished"));
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!toDelete) return;
      const result = await deleteModelAction({ modelId: toDelete.id });
      setToDelete(null);
      if (!result.ok) return report(result.error.message);
      toast.success(t("deleted", { title: result.data.title }));
      router.refresh();
    });

  return (
    <>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 p-0">
        {models.map((model) => (
          <li key={model.id} className="relative flex flex-col gap-2">
            <ModelCard
              href={`/models/${model.slug}/edit`}
              model={{ ...model, authorPseudo }}
              badge={
                <span
                  className={cn(
                    "absolute bottom-3.5 left-3.5 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-chip",
                    STATUS_TONE[model.status],
                  )}
                >
                  {tStatus(model.status)}
                </span>
              }
            />
            <div className="absolute top-5 right-5 z-10">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t("actions", { title: model.title })}
                  className="inline-flex size-11 items-center justify-center rounded-full bg-background shadow-fab"
                >
                  <EllipsisVertical aria-hidden="true" className="size-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem asChild>
                    <Link href={`/models/${model.slug}/edit`} className="min-h-11">
                      <Pencil aria-hidden="true" />
                      {t("edit")}
                    </Link>
                  </DropdownMenuItem>
                  {model.status === "PUBLISHED" && (
                    <DropdownMenuItem
                      className="min-h-11"
                      disabled={pending}
                      onSelect={() => unpublish(model)}
                    >
                      <EyeOff aria-hidden="true" />
                      {t("unpublish")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    className="min-h-11"
                    disabled={pending}
                    onSelect={() => setToDelete(model)}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <span className="px-2 text-sm text-muted-foreground">
              {t("updated", {
                date: format.dateTime(new Date(model.updatedAt), { dateStyle: "medium" }),
              })}
            </span>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t("deleteTitle", { title: toDelete?.title ?? "" })}
        description={t("deleteText")}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={t("cancel")}
        pending={pending}
        onConfirm={remove}
      />
    </>
  );
}
