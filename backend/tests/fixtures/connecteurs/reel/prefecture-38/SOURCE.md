# Source — prefecture-38 (Isère)

**Capture initiale (hypothèse par recherche web)** : 2026-08-15 (lot 37-41).
**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) : 2026-08-18.

**URL cible** : `https://www.isere.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs`

## Structure confirmée en live sur `.../Recueils-des-Actes-Administratifs-de-la-préfecture-de-l'Isère---2026`

- **CORRECTION IMPORTANTE par rapport à l'hypothèse initiale** (liste plate
  `div[class='']:has(a.fr-link--download)`, extrapolée de la structure DSFR
  majoritaire) : la page réelle est un unique `<select class="fr-select">`
  (327 `<option>` constatés en live) — même famille que prefecture-77, PAS
  la famille "liste plate" de 37/41.
- Chaque `<option value="Publications/RAA-Recueil-des-actes-administratifs/.../slug">`
  (valeur SANS "/" initial, confirmé en live — s'appuie sur la
  normalisation existante de `resoudreUrl()` dans le moteur, déjà exercée
  par prefecture-77) pointe vers une page de détail HTML, PAS directement
  vers le PDF.
- Confirmé sur une page de détail réelle : un seul lien
  `a.fr-link--download` vers le PDF réel, ex.
  `/contenu/telechargement/84641/648555/file/recueil-38-2026-329-recueil-des-actes-administratifs-special.pdf`.
- `url_liste` et le motif de l'étape `navigation` (racine → carte de
  l'année) confirmés inchangés.
- Signataire réel : décret de nomination du 6 novembre 2024 (Légifrance) —
  Mme Catherine Séguin, "La préfète de l'Isère" — non re-vérifié en live
  (hors périmètre de la capture DOM).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`) ; nombre exact d'options (327 constaté, mais
seules 2 sont reproduites dans les fixtures, plus le placeholder
`value=""`).
