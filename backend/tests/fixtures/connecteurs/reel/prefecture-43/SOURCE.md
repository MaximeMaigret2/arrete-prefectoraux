# Source — prefecture-43 (Haute-Loire)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 42-46).

**URL cible** : `https://www.haute-loire.gouv.fr/Publications/Recueils-des-actes-administratifs`

## Structure confirmée en live

- `url_liste` confirmé, menant à des cartes "Recueil des actes
  administratifs {annee}" (2017 à 2026 constatées).
- La carte de l'année courante mène DIRECTEMENT à une liste plate (même
  famille que prefecture-42), ordre chronologique CROISSANT, aucune
  pagination.
- **PIÈGE CONFIRMÉ EN LIVE** : la page contient 380 ancres
  `a[href$=".pdf"]` au total, mais seulement 190 hrefs UNIQUES — un second
  bloc (hors `.fr-downloads-group`) duplique intégralement le premier
  (ordre inversé), probablement une vue alternative du même contenu non
  identifiée précisément. `selecteur_publications: ".fr-downloads-group li"`
  scope strictement au premier bloc et retrouve exactement les 190
  correspondances uniques (vérifié en live par comparaison d'ensembles de
  hrefs) — un sélecteur non qualifié aurait produit chaque candidat en
  double.
- Signataire réel : confirmé DIRECTEMENT sur la page officielle du corps
  préfectoral
  (`https://www.haute-loire.gouv.fr/Services-de-l-Etat/Prefecture-et-sous-prefectures/Prefecture-de-la-Haute-loire/Le-corps-prefectoral/Le-prefet-de-la-Haute-Loire`,
  mise à jour 25/06/2024, décret de nomination du 13 juillet 2023,
  Légifrance) : M. Yvan Cordier, "Le préfet de la Haute-Loire".

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
