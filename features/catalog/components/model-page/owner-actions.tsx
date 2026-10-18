"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { pillButton } from "@/components/ui/pill-button";
import { deleteModelAction } from "@/features/models/actions";

/** Pilules Modifier / Supprimer de la fiche, pour l'auteur et les administrateurs. */
export function OwnerActions({
  modelId,
  slug,
  title,
}: {
  modelId: string;
  slug: string;
  title: string;
}) {
  const t = useTranslations("modelPage");
  const tMe = useTranslations("me");
  const tRoot = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteModelAction({ modelId });
      setOpen(false);
      if (!result.ok) {
        const key = result.error.message;
        toast.error(tRoot.has(key) ? tRoot(key) : tRoot("errors.generic"));
        return;
      }
      toast.success(tMe("deleted", { title: result.data.title }));
      router.push("/me");
    });

  return (
    <>
      <Link href={`/models/${slug}/edit`} className={pillButton({ variant: "soft", size: "sm" })}>
        <Pencil aria-hidden="true" className="size-5" />
        {t("edit")}
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={pillButton({
          variant: "soft",
          size: "sm",
          className: "text-destructive hover:text-destructive",
        })}
      >
        <Trash2 aria-hidden="true" className="size-5" />
        {t("delete")}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={tMe("deleteTitle", { title })}
        description={tMe("deleteText")}
        confirmLabel={tMe("deleteConfirm")}
        cancelLabel={tMe("cancel")}
        pending={pending}
        onConfirm={remove}
      />
    </>
  );
}
