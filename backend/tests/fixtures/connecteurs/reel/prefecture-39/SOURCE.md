# Source — prefecture-39 (Jura)

**Capture initiale (hypothèse par recherche web)** : 2026-08-15 (lot 37-41).
**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) : 2026-08-18.

**URL cible** : `https://www.jura.gouv.fr/Publications/Publications-legales/Recueil-des-Actes-Administratifs`

## Structure confirmée en live sur `.../Annee-2026`

- **Correction par rapport à l'hypothèse initiale** : PAS de `page_detail`.
  Chaque bulletin est une carte DSFR `.fr-card` dont le lien
  (`h3.fr-card__title > a.fr-card__link`, classe complète observée
  `"fr-card__link menu-item-link"`) pointe **directement** vers le fichier
  PDF (ex. `/contenu/telechargement/36948/274727/file/RAA 39-2026-08-012 du
  18-08-2026.pdf`) — même famille que prefecture-36/Indre, PAS
  prefecture-02/77.
- **Pagination confirmée** (absente de l'hypothèse initiale) : la page de
  l'année 2026 a un lien `.fr-pagination__link--last` (href
  `.../Annee-2026/(offset)/170`, soit 18 pages de 10 bulletins, ordre
  chronologique croissant — la dernière page contient donc les bulletins
  les plus récents). Fixtures : `Annee-2026.html` (page 1, avec le lien
  "Dernière page") + `Annee-2026-offset-170.html` (dernière page, contenant
  les 2 bulletins de test).
- PDF réels indexés avec des noms à espaces et accents encodés, ex.
  `RAA%2039-2025-05-007%20du%2016-05-2025.pdf` — convention de nommage
  différente des autres départements (mots séparés par espace encodé plutôt
  que tirets), reprise dans ces fixtures.
- Signataire réel : décret de nomination le plus récent trouvé, 12 mars 2025
  (Légifrance) — M. Pierre-Édouard Colliex, "Le préfet du Jura" (un décret
  antérieur mentionnait un autre titulaire, remplacé depuis) — non re-vérifié
  en live (hors périmètre de la capture DOM).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab` — le téléchargement d'un vrai PDF n'a pas été
tenté via le navigateur cette session).
