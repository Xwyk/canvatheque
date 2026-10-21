import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  bmpToRaw,
  CORNER_RADIUS_RATIO,
  CwprjError,
  decryptCwprj,
  extractCwprjPreview,
  readCwprjHeader,
  roundTopLeftCorner,
  THUMBNAIL_BASE64_MAX,
  xmlText,
} from "@/lib/cwprj";
import { parseCwprjKeys } from "@/lib/cwprj-keys";
import { parseEnv } from "@/lib/env";
import {
  bmpImage,
  cwprjFile,
  encryptCwprj,
  fcmxXml,
  testCwprjKey,
  thumbnailImage,
} from "@/tests/support/cwprj";

const reason = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CwprjError) return error.reason;
    throw error;
  }
  return "ok";
};

describe("parseCwprjKeys", () => {
  it("désactivé sans variable ; paires séparées par des virgules", () => {
    expect(parseCwprjKeys()).toEqual([]);
    const a = testCwprjKey();
    const b = testCwprjKey();
    const keys = parseCwprjKeys(`${a.hexKey}, ${b.hexKey}`, `${a.hexIv},${b.hexIv}`);
    expect(keys).toHaveLength(2);
    expect(Buffer.from(keys[1]!.key).toString("hex")).toBe(b.hexKey);
    expect(keys[0]!.iv).toHaveLength(16);
  });

  it("refuse une variable seule, des listes inégales, des valeurs mal formées", () => {
    const { hexKey, hexIv } = testCwprjKey();
    expect(() => parseCwprjKeys(hexKey)).toThrow("se renseignent ensemble");
    expect(() => parseCwprjKeys(undefined, hexIv)).toThrow("se renseignent ensemble");
    expect(() => parseCwprjKeys(`${hexKey},${hexKey}`, hexIv)).toThrow("autant de valeurs");
    expect(() => parseCwprjKeys(hexKey.slice(2), hexIv)).toThrow("CWPRJ_KEY : 64 caractères");
    expect(() => parseCwprjKeys(hexKey, `${hexIv.slice(1)}z`)).toThrow("CWPRJ_IV : 32 caractères");
  });

  it("validé au démarrage par lib/env", () => {
    const base = {
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://u:p@localhost/db",
      AUTH_SECRET: "x".repeat(32),
      S3_ENDPOINT: "http://localhost:9000",
      S3_PUBLIC_URL: "http://localhost:9000",
      S3_ACCESS_KEY: "a",
      S3_SECRET_KEY: "b",
      ADMIN_EMAIL: "admin@exemple.fr",
    };
    const { hexKey, hexIv } = testCwprjKey();
    expect(parseEnv({ ...base, CWPRJ_KEY: hexKey, CWPRJ_IV: hexIv }).CWPRJ_KEY).toBe(hexKey);
    expect(parseEnv({ ...base, CWPRJ_KEY: "", CWPRJ_IV: "" }).CWPRJ_KEY).toBeUndefined();
    expect(() => parseEnv({ ...base, CWPRJ_KEY: hexKey })).toThrow(
      "CWPRJ_KEY : CWPRJ_KEY et CWPRJ_IV se renseignent ensemble",
    );
  });
});

describe("decryptCwprj", () => {
  it("déchiffre un document FCMX, avec la seconde paire si la première échoue", async () => {
    const key = testCwprjKey();
    const other = testCwprjKey();
    const file = cwprjFile(key, { designName: "Boîte" });
    expect(await decryptCwprj(file, key.keys)).toContain("<DesignName>Boîte</DesignName>");
    expect(await decryptCwprj(file, [...other.keys, ...key.keys])).toContain("<FCMX");
    // BOM UTF-8 et sans déclaration XML : acceptés.
    const bom = encryptCwprj(Buffer.from("﻿<FCMX><FileHeaderSection/></FCMX>"), key);
    expect(await decryptCwprj(bom, key.keys)).toMatch(/^<FCMX>/);
  });

  it("ancien format, contenu non chiffré, mauvaise clé, document qui n'est pas FCMX", async () => {
    const key = testCwprjKey();
    expect(await reason(decryptCwprj(Buffer.from("#FCM0123456789ab"), key.keys))).toBe(
      "legacyFormat",
    );
    expect(await reason(decryptCwprj(Buffer.from("pas un multiple"), key.keys))).toBe(
      "notEncrypted",
    );
    expect(await reason(decryptCwprj(Buffer.alloc(0), key.keys))).toBe("notEncrypted");
    expect(await reason(decryptCwprj(cwprjFile(key), testCwprjKey().keys))).toBe("decryptFailed");
    expect(await reason(decryptCwprj(encryptCwprj("<html>autre</html>", key), key.keys))).toBe(
      "notFcmx",
    );
    expect(await reason(decryptCwprj(encryptCwprj("<?xml sans fin", key), key.keys))).toBe(
      "notFcmx",
    );
    expect(await reason(decryptCwprj(cwprjFile(key), []))).toBe("decryptFailed");
  });
});

describe("readCwprjHeader", () => {
  it("nom du motif : attributs, CDATA, entités, espaces", () => {
    const xml = fcmxXml({
      header: `<DesignName lang="fr">  Bo&#238;te &amp; <![CDATA[<houx>]]>\n &#x2764;&nbsp; </DesignName>`,
    });
    expect(readCwprjHeader(xml)).toEqual({
      designName: "Boîte & <houx> ❤&nbsp;",
      thumbnail: null,
    });
    expect(xmlText("&#0; &#x110000; &inconnue;")).toBe("&#0; &#x110000; &inconnue;");
    expect(xmlText("a<![CDATA[non fermé")).toBe("anon fermé");
  });

  it("élément vide, auto-fermant, voisin au nom proche ; en-tête absent", () => {
    expect(
      readCwprjHeader(fcmxXml({ header: "<DesignNameOld>x</DesignNameOld><DesignName/>" })),
    ).toEqual({ designName: null, thumbnail: null });
    expect(
      readCwprjHeader(fcmxXml({ header: "<DesignName></DesignName><ThumbnailImage/>" })),
    ).toEqual({ designName: null, thumbnail: null });
    expect(readCwprjHeader("<FCMX><PageSection/></FCMX>")).toEqual({
      designName: null,
      thumbnail: null,
    });
    expect(readCwprjHeader("<FCMX><FileHeaderSection><DesignName>coupé")).toEqual({
      designName: null,
      thumbnail: null,
    });
    expect(readCwprjHeader("<FCMX><FileHeaderSection")).toEqual({
      designName: null,
      thumbnail: null,
    });
  });

  it("miniature PNG, JPEG, BMP ; préfixe data: et retours à la ligne retirés", async () => {
    const png = await thumbnailImage("png");
    const jpeg = await thumbnailImage("jpeg");
    const base64 = `data:image/png;base64,${png.toString("base64").replace(/(.{60})/g, "$1\n")}`;
    expect(readCwprjHeader(fcmxXml({ designName: "Houx", thumbnail: base64 })).thumbnail).toEqual({
      bytes: png,
      mime: "image/png",
    });
    expect(readCwprjHeader(fcmxXml({ thumbnail: jpeg })).thumbnail?.mime).toBe("image/jpeg");
    expect(readCwprjHeader(fcmxXml({ thumbnail: bmpImage() })).thumbnail?.mime).toBe("image/bmp");
  });

  it("refuse une miniature trop longue, mal encodée ou d'un autre type", () => {
    const tooLong = "A".repeat(THUMBNAIL_BASE64_MAX + 4);
    const read = (thumbnail: string) => {
      try {
        readCwprjHeader(fcmxXml({ thumbnail }));
        return "ok";
      } catch (error) {
        return (error as CwprjError).reason;
      }
    };
    expect(read(tooLong)).toBe("thumbnailTooLarge");
    expect(read(" ".repeat(THUMBNAIL_BASE64_MAX * 2 + 1))).toBe("thumbnailTooLarge");
    expect(read("@@@@")).toBe("thumbnailInvalid");
    expect(read(Buffer.from("GIF89a-------").toString("base64"))).toBe("thumbnailType");
  });
});

describe("bmpToRaw", () => {
  const pixel = (raw: { data: Buffer; width: number }, x: number, y: number) => [
    ...raw.data.subarray((y * raw.width + x) * 4, (y * raw.width + x) * 4 + 4),
  ];

  it("24 bits de bas en haut, 32 bits de haut en bas, alpha inutilisé rendu opaque", () => {
    for (const options of [
      { bitsPerPixel: 24 as const },
      { bitsPerPixel: 32 as const, topDown: true },
      { bitsPerPixel: 32 as const, alpha: 0 },
    ]) {
      const raw = bmpToRaw(bmpImage(options));
      expect([raw.width, raw.height]).toEqual([3, 2]);
      expect(pixel(raw, 0, 0)).toEqual([255, 0, 0, 255]);
      expect(pixel(raw, 2, 1)).toEqual([0, 0, 255, 255]);
    }
    // Transparence réelle conservée.
    expect(pixel(bmpToRaw(bmpImage({ bitsPerPixel: 32, alpha: 128 })), 1, 1)[3]).toBe(128);
  });

  it("refuse compression, profondeur, dimensions et fichier tronqué", () => {
    const refused = (bytes: Buffer) => {
      try {
        bmpToRaw(bytes);
        return false;
      } catch (error) {
        return (error as CwprjError).reason === "bmpUnsupported";
      }
    };
    expect(refused(bmpImage({ compression: 1 }))).toBe(true);
    const eightBits = bmpImage();
    eightBits.writeUInt16LE(8, 28);
    expect(refused(eightBits)).toBe(true);
    expect(refused(bmpImage().subarray(0, 60))).toBe(true);
    expect(refused(Buffer.from("BM"))).toBe(true);
    const huge = bmpImage();
    huge.writeInt32LE(100_000, 18);
    huge.writeInt32LE(100_000, 22);
    expect(refused(huge)).toBe(true);
    const empty = bmpImage();
    empty.writeInt32LE(0, 18);
    expect(refused(empty)).toBe(true);
  });
});

describe("extractCwprjPreview", () => {
  it("PNG, JPEG et BMP ré-encodés en PNG, aux dimensions d'origine", async () => {
    const key = testCwprjKey();
    for (const thumbnail of [await thumbnailImage("png"), await thumbnailImage("jpeg")]) {
      const { designName, image } = await extractCwprjPreview(
        cwprjFile(key, { designName: "Houx", thumbnail }),
        key.keys,
      );
      const meta = await sharp(image!).metadata();
      expect([designName, meta.format, meta.width, meta.height]).toEqual(["Houx", "png", 40, 30]);
    }

    const fromBmp = await extractCwprjPreview(
      cwprjFile(key, { thumbnail: bmpImage({ width: 5, height: 4 }) }),
      key.keys,
    );
    const meta = await sharp(fromBmp.image!).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 5, 4]);

    expect(await extractCwprjPreview(cwprjFile(key, { designName: "Seul" }), key.keys)).toEqual({
      designName: "Seul",
      image: null,
    });
  });

  it("arrondit l'angle supérieur gauche de la page, après la marge transparente", async () => {
    const key = testCwprjKey();
    // Comme CanvasWorkspace : page blanche décalée de 20 px à gauche et 30 px en haut.
    const page = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: { create: { width: 180, height: 170, channels: 4, background: "#ffffff" } },
          left: 20,
          top: 30,
        },
      ])
      .png()
      .toBuffer();
    const { image } = await extractCwprjPreview(cwprjFile(key, { thumbnail: page }), key.keys);
    const { data, info } = await sharp(image!).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    const radius = Math.round(200 * CORNER_RADIUS_RATIO); // 16 px
    expect(alpha(20, 30)).toBe(0); // angle de la page : retiré
    expect(alpha(20 + radius, 30 + radius)).toBe(255); // centre de l'arrondi : intact
    expect(alpha(20 + radius, 30)).toBe(255); // bord haut, après l'arrondi
    expect(alpha(20, 30 + radius)).toBe(255); // bord gauche, après l'arrondi
    expect(alpha(199, 30)).toBe(255); // angle supérieur droit : inchangé
    expect(alpha(20, 199)).toBe(255); // angle inférieur gauche : inchangé
    expect(alpha(10, 10)).toBe(0); // marge : toujours transparente
    // Bord anticrénelé : valeurs intermédiaires sur l'arc.
    const arc = Array.from({ length: radius }, (_, i) => alpha(20 + i, 30 + radius - i - 1));
    expect(arc.some((value) => value! > 0 && value! < 255)).toBe(true);
  });

  it("roundTopLeftCorner : image transparente intacte, rayon borné à l'image", () => {
    const empty = { data: Buffer.alloc(4 * 4 * 4), width: 4, height: 4 };
    roundTopLeftCorner(empty);
    expect(empty.data.every((byte) => byte === 0)).toBe(true);
    const tiny = { data: Buffer.alloc(2 * 2 * 4, 255), width: 2, height: 2 };
    roundTopLeftCorner(tiny, 1);
    expect(tiny.data[3]).toBeLessThan(255);
    expect(tiny.data[15]).toBe(255);
  });

  it("propage la raison d'un échec", async () => {
    const key = testCwprjKey();
    expect(await reason(extractCwprjPreview(cwprjFile(key), testCwprjKey().keys))).toBe(
      "decryptFailed",
    );
    expect(
      await reason(
        extractCwprjPreview(cwprjFile(key, { thumbnail: bmpImage({ compression: 2 }) }), key.keys),
      ),
    ).toBe("bmpUnsupported");
    // PNG tronqué : signature reconnue mais image illisible.
    const broken = (await thumbnailImage("png")).subarray(0, 40);
    expect(await reason(extractCwprjPreview(cwprjFile(key, { thumbnail: broken }), key.keys))).toBe(
      "thumbnailInvalid",
    );
  });
});
