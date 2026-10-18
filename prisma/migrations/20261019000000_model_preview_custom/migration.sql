-- Étape 2 : origine de l'aperçu (image du membre ou rendu du SVG).
ALTER TABLE "Model" ADD COLUMN "previewCustom" BOOLEAN NOT NULL DEFAULT false;
