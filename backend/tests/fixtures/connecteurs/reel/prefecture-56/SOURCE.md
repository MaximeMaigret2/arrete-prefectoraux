# Source réelle — prefecture-56 (Morbihan)

Capture live (navigateur Chrome réel) le 2026-08-19 (lot 52-56), avant
l'écriture de la config.

- Racine : SANS carte DSFR — sélecteur d'année en
  `<select id="Années-liste-docs" class="fr-select">` (même idiome V011
  que prefecture-17/55, `attribut_lien: "value"` dès la première étape).
  Chaque `<option value="RAA/Annee-{annee}">` (SANS "/" de tête) —
  **vérifié en live que la résolution racine-domaine est la bonne**
  (navigation directe vers `https://www.morbihan.gouv.fr/RAA/Annee-2026`,
  qui répond avec le contenu attendu — pas une résolution relative au
  chemin courant).
- Page de l'année : page de type "actualités" DSFR PAGINÉE
  (`.fr-pagination`, 10 par page, 10 pages) où chaque publication est une
  `.fr-card` (comptage exact confirmé en live : 10 = 10) DONT LE TITRE
  (`.fr-card__title a`) POINTE DIRECTEMENT VERS LE PDF (href se termine
  par ".pdf", vérifié en live) — pas de page de détail intermédiaire, à
  la différence de toutes les cartes `page_detail` vues jusqu'ici.
  AUCUNE étape de pagination nécessaire : trié du plus récent au plus
  ancien, la page 1 (atteinte par défaut) contient déjà les publications
  les plus récentes — la pagination ne sert qu'à consulter des
  publications plus anciennes.
- Signataire confirmé par décret de nomination (Légifrance) : M. Michaël
  GALY, préfet du Morbihan (décret du 7 mai 2025).

Fixtures synthétiques (`raa-56-2026-099.pdf` pertinent,
`raa-56-2026-098.pdf` non pertinent) — hrefs/format réalistes issus de la
capture live, texte des PDF reconstruit.
