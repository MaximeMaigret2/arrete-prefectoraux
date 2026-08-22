# Source — prefecture-46 (Lot)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 42-46).

**URL cible** : `https://www.lot.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

## Structure confirmée en live

- `url_liste` confirmé, menant à des cartes "RAA {annee}" (2022 à 2026,
  plus une carte "Archives du RAA").
- **`page_detail` CONFIRMÉ** : chaque bulletin est une carte
  `.fr-card__title` (lien `a.fr-card__link`) menant à une page de DÉTAIL au
  slug descriptif (ex. ".../RAA-2026/RAA-special-46-2026-084"), PAS
  directement vers le PDF.
- Sur la page de détail, le lien de téléchargement porte bien la classe
  `a.fr-link--download` exploitable — PAS de piège de balisage ici (à la
  différence de prefecture-40 où cette classe est cassée).
- **Pagination CONFIRMÉE** : la page de l'année 2026 a
  `.fr-pagination__link--last` (href ".../RAA-2026/(offset)/80"), ordre
  chronologique CROISSANT (le plus ancien en premier sur la page 1 —
  "recueil spécial 46-2026-001" — la dernière page contient donc les
  bulletins les plus récents, ex. "RAA spécial 46-2026-084" observé daté du
  17/08/2026 sur sa page de détail).
- Signataire réel : décret de nomination du 19 janvier 2026 (Légifrance) —
  Mme Marilyne Poulain, préfète du Lot.

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).

## Piège rencontré en test (2026-08-19)

Premier jet de la config avec `selecteur_publications: ".fr-card__title"`
(le conteneur `<h3>`) et `selecteur_titre: "a.fr-card__link"` (descendant) :
0 candidat, sans erreur. Cause : `resoudreUrlPdfPublication` (moteur.ts)
lit `page_detail.attribut_lien` directement via `$publication.attr(...)`,
JAMAIS sur un descendant — un `<h3>` ne porte pas de `href`. Corrigé en
ciblant directement le lien (`selecteur_publications: "a.fr-card__link"`,
`selecteur_titre` volontairement non-satisfaisable pour retomber sur
`$publication.text()`), comme le fait déjà prefecture-40. À retenir pour
tout futur connecteur `page_detail` : `selecteur_publications` doit être
l'élément qui porte RÉELLEMENT `page_detail.attribut_lien`, jamais un
simple conteneur.
