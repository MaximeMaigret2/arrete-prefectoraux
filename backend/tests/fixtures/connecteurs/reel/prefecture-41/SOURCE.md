# Source — prefecture-41 (Loir-et-Cher)

**Capture initiale (hypothèse par recherche web)** : 2026-08-15 (lot 37-41).
**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) : 2026-08-18.

**URL cible** : `https://www.loir-et-cher.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Structure confirmée en live

- `url_liste` confirmé : `.../Publications/Recueil-des-actes-administratifs`, menant à des pages `.../Annee-{annee}`.
- **Deuxième niveau de navigation confirmé** : la page de l'année 2026 liste
  12 cartes DSFR (`.fr-card__title a`), une par mois.
- **PIÈGE CONFIRMÉ EN LIVE** (absent de l'hypothèse initiale) : le suffixe
  "-{annee}" sur le segment mois n'est **PAS constant selon l'année**.
  Vérifié sur le site réel :
  - `Annee-2026` (année courante) : `.../Annee-2026/Aout` (SANS suffixe).
  - `Annee-2020` (archive) : `.../Annee-2020/Aout-2020` (AVEC suffixe).
  D'où le motif `"{mois_fr}(-{annee})?$"` (suffixe rendu optionnel) dans
  `prefecture-41.yaml`, plutôt que le motif initial `"{mois_fr}-{annee}$"`
  qui aurait échoué sur l'année courante dès son déploiement.
- `selecteur_publications`/`selecteur_lien_pdf` (liste plate
  `div[class='']:has(a.fr-link--download)`) CONFIRMÉS en live sur
  `.../Annee-2026/Aout` : 13 correspondances qualifiées vs 17 pour le
  sélecteur non qualifié (bug de sur-correspondance `:has()` documenté pour
  prefecture-37 — la qualification reste nécessaire ici aussi). Pas de
  pagination sur cette page.
- Signataire réel : décret de nomination du 23 juillet 2025 (Légifrance) —
  M. Joseph Zimet, "Le préfet de Loir-et-Cher" — non re-vérifié en live
  (hors périmètre de la capture DOM).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
