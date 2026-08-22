# Source — prefecture-44 (Loire-Atlantique)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 42-46).

**URL cible** : `https://www.loire-atlantique.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA-en-Loire-Atlantique`

## Structure confirmée en live

- Navigation à DEUX niveaux : racine → carte de l'année (".../2026") →
  carte du mois (".../2026/Aout", nom du mois sans accent, capitale
  initiale, conforme au placeholder `{mois_fr}`).
- **PIÈGE CONFIRMÉ EN LIVE** (racine ET page année) : chaque page mélange
  les cartes de navigation (`.fr-card__title a`, hrefs se terminant par
  "/{annee}" ou "/{mois_fr}") avec 2-3 liens PDF "à la une" utilisant EXACTEMENT
  le même sélecteur mais un href se terminant par ".pdf" — jamais confondus
  car les motifs de navigation (`"/{annee}$"`, `"/{mois_fr}$"`) sont ancrés
  en fin de chaîne (même principe que prefecture-77).
- Page du mois : chaque bulletin est `.fr-card__title` > `a.fr-card__link`
  (classe complète observée "fr-card__link menu-item-link") pointant
  DIRECTEMENT vers le PDF — même famille que prefecture-39. Ordre
  DÉCROISSANT confirmé en live (le plus récent en PREMIER, ex. "RAA n°211"
  avant "n°210" avant "n°209"...) : à la différence de 39/40/46 (ordre
  croissant + saut à la dernière page de pagination), **aucune étape de
  pagination n'est nécessaire ici** — la première page (déjà `url_liste`
  après navigation) contient les bulletins les plus récents.
- Signataire réel : décret de nomination du 24 juin 2026 (Légifrance) — M.
  Laurent Hottiaux, préfet de la région Pays de la Loire, préfet de la
  Loire-Atlantique.

- **Piège d'encodage confirmé** : les vrais noms de fichiers observés en
  live contiennent des espaces et des caractères accentués (ex. "RAA n°211
  du 18 août 2026.pdf"). `resoudreUrl`/`new URL()` les encode
  automatiquement en `%20`/UTF-8 percent-encoded à la résolution — sans
  bug côté moteur (vérifié : `new URL(href, base).toString()` produit une
  URL valide et cohérente). La fixture ci-dessous utilise un slug
  tiret-only pour éviter la fragilité d'un stub `fetch` sur URL encodée,
  cohérent avec les autres fixtures du dépôt.

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
