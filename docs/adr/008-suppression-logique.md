# ADR-008 : Suppression logique des modèles, objets effacés aussitôt

- Statut : acceptée (2026-10-18), étape 2

## Contexte

Supprimer un modèle doit libérer son slug dans les listes, ses fichiers dans MinIO, sans casser
les références (téléchargements, favoris, signalements, journal de modération à venir).
Le plan prévoyait un « soft delete et suppression différée des objets ».

## Décision

- **Base** : `Model.deletedAt` est renseigné (suppression logique). Toutes les lectures filtrent
  `deletedAt IS NULL` ; les lignes liées restent pour l'historique. Les envois en attente du
  modèle passent à ABANDONED.
- **Objets** : le fichier, toutes les versions d'aperçu (`<modelId>/…`) et les objets temporaires
  sont supprimés **immédiatement après** la mise à jour en base, sans file d'attente. Un échec de
  MinIO est journalisé (`storage_cleanup_failed`) sans annuler la suppression : l'objet orphelin
  n'est plus référencé ni accessible (bucket des modèles privé ; aperçus non listés).
- Le slug d'un modèle supprimé reste réservé (unicité en base) : un nouveau modèle de même titre
  reçoit un suffixe (`-2`).

## Conséquences

- Pas de tâche planifiée à exploiter ; la suppression est vérifiable dans les tests d'intégration
  (base et MinIO).
- Pas d'annulation possible après confirmation (dialogue explicite « irréversible »).
- Les objets orphelins éventuels (panne MinIO) pourront être repérés par un inventaire
  administrateur (étape 5).
