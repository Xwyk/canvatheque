import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildPreviewSet, ImageError, rasterizeSvg } from "@/lib/images/preview";

const wideSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="100" height="100" fill="#C81E4B"/></svg>`;
const tallSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 100"><circle cx="25" cy="50" r="20"/></svg>`;

describe("rasterizeSvg", () => {
  it("ramène le plus grand côté à 1600 px, fond transparent", async () => {
    const wide = await sharp(await rasterizeSvg(wideSvg)).metadata();
    expect([wide.width, wide.height]).toEqual([1600, 800]);
    expect(wide.hasAlpha).toBe(true);
    const tall = await sharp(await rasterizeSvg(tallSvg)).metadata();
    expect([tall.width, tall.height]).toEqual([800, 1600]);
  });

  it("signale un SVG illisible", async () => {
    await expect(rasterizeSvg("<pas du svg")).rejects.toBeInstanceOf(ImageError);
  });
});

describe("buildPreviewSet", () => {
  it("produit trois variantes WebP sans agrandissement", async () => {
    const set = await buildPreviewSet(await rasterizeSvg(wideSvg));
    expect(set.variants.map((v) => v.suffix)).toEqual(["sm", "md", "lg"]);
    const widths = await Promise.all(
      set.variants.map(async (v) => (await sharp(v.buffer).metadata()).width),
    );
    expect(widths).toEqual([400, 800, 1600]);
    expect((await sharp(set.variants[0]!.buffer).metadata()).format).toBe("webp");
    expect([set.width, set.height]).toEqual([1600, 800]);

    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#0F7C7E" },
    })
      .png()
      .toBuffer();
    const smallSet = await buildPreviewSet(small);
    expect([smallSet.width, smallSet.height]).toEqual([300, 200]);
  });

  it("applique l'orientation EXIF puis supprime les métadonnées", async () => {
    // JPEG 200×100 marqué « rotation 90° » : l'aperçu doit faire 100×200, sans EXIF.
    const jpeg = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#fff" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const set = await buildPreviewSet(jpeg);
    expect([set.width, set.height]).toEqual([100, 200]);
    const meta = await sharp(set.variants[2]!.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("recadre selon des proportions de l'image", async () => {
    const set = await buildPreviewSet(await rasterizeSvg(wideSvg), {
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect([set.width, set.height]).toEqual([800, 800]);
    // Recadrage débordant : borné à l'image.
    const edge = await buildPreviewSet(await rasterizeSvg(wideSvg), {
      x: 0.9,
      y: 0.9,
      width: 0.5,
      height: 0.5,
    });
    expect(edge.width).toBeGreaterThan(0);
  });

  it("refuse une image illisible", async () => {
    await expect(buildPreviewSet(Buffer.from("pas une image"))).rejects.toMatchObject({
      code: "imageInvalid",
    });
  });
});
