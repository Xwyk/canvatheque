-- Étape 5 : l'unicité (modèle, auteur du signalement, statut) empêchait de clore un second
-- signalement du même membre. Seul le signalement ouvert reste unique.
DROP INDEX "Report_modelId_reporterId_status_key";

CREATE UNIQUE INDEX "Report_open_reporter_key" ON "Report" ("modelId", "reporterId") WHERE "status" = 'OPEN';

CREATE INDEX "Report_modelId_status_idx" ON "Report"("modelId", "status");
