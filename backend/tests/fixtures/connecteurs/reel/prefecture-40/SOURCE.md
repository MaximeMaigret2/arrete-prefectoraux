# Source — prefecture-40 (Landes)

**Capture initiale (hypothèse par recherche web)** : 2026-08-15 (lot 37-41).
**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) : 2026-08-18.

**URL cible** : `https://www.landes.gouv.fr/Publications/Publications-legales/Le-Recueil-des-Actes-Administratifs-RAA`

## Structure confirmée en live sur `.../Le-Recueil-des-Actes-Administratifs-RAA/2026`

- `url_liste` confirmé : segment ANNÉE nombre nu (`.../2026`), pas préfixé
  "Annee-" (différent de 37/38/39/41) — hypothèse initiale correcte.
- **`page_detail` CONFIRMÉ** (hypothèse initiale correcte) : chaque
  publication est une carte `.fr-card` dont le lien `.fr-card__link` (dans
  `.fr-card__title`) pointe vers une page de détail au slug descriptif
  (ex. `.../2026/RAA-n-276-du-18-aout`), PAS directement vers le PDF.
- **PIÈGE DÉCOUVERT EN LIVE** (absent de l'hypothèse initiale) : sur la
  page de détail, le lien de téléchargement n'a PAS la classe
  `fr-link--download` exploitable (attribut `class` vide constaté en live
  sur 2 bulletins distincts — probable bug de balisage côté site), mais vit
  dans un conteneur DSFR standard `.fr-downloads-group`
  (`<div class="fr-downloads-group fr-downloads-group--bordered">`) —
  confirmé identique sur les bulletins "RAA n°276" et "RAA n°274" de 2026.
  `selecteur_lien_pdf: ".fr-downloads-group a"` cible ce conteneur plutôt
  que la classe du lien lui-même.
- **Pagination CONFIRMÉE** (absente de l'hypothèse initiale) : la page de
  l'année 2026 a `.fr-pagination__link--last` (href `.../2026/(offset)/260`,
  soit 27 pages de 10 bulletins, ordre chronologique croissant — la
  dernière page contient donc les bulletins les plus récents).
- Le préfixe `/index.php/` observé sur d'anciens résultats de recherche est
  bien absent de la structure DSFR actuelle (confirmé en live sur 2026).
- Signataire réel : décret de nomination du 26 mars 2025 (Légifrance) —
  M. Gilles Clavreul, "Le préfet des Landes" — non re-vérifié en live (hors
  périmètre de la capture DOM).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
