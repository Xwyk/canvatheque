import { z } from "@/lib/validation";

const ratio = z.number().min(0).max(1);

export const cropSchema = z
  .object({ x: ratio, y: ratio, width: ratio.positive(), height: ratio.positive() })
  .refine((crop) => crop.x + crop.width <= 1.0001 && crop.y + crop.height <= 1.0001, "crop");

export const createUploadSchema = z.object({
  kind: z.enum(["MODEL", "PREVIEW"]),
  fileName: z.string().min(1, "required").max(512),
  size: z.number().int().nonnegative(),
  mime: z.string().max(255).default(""),
  modelId: z.string().min(1).max(64).optional(),
});
export type CreateUploadInput = z.input<typeof createUploadSchema>;

export const confirmUploadSchema = z.object({
  uploadId: z.string().min(1).max(64),
  crop: cropSchema.optional(),
});
export type ConfirmUploadInput = z.input<typeof confirmUploadSchema>;
