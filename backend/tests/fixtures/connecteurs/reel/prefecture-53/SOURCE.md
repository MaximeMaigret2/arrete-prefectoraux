# Source réelle — prefecture-53 (Mayenne)

Capture live (navigateur Chrome réel) le 2026-08-19 (lot 52-56), avant
l'écriture de la config.

- Racine : `.fr-card__title a`, 1 niveau, `Annee-{annee}$`.
- Page année : `.fr-card__title a`, 12 cartes mois (toute l'année déjà
  listée), `{mois_fr}-{annee}$` (ex. "Aout-2026").
- Page du mois (août 2026) : 14 publications, chacune un `<p>` SANS
  classe contenant directement `a.fr-link--download` (comptage exact
  confirmé en live par deux méthodes indépendantes : requête directe
  `a.fr-link--download` = 14, et somme des liens par `<p>` = 14 — la
  première tentative de comptage par texte "RAA" sur tous les `<a>`
  avait remonté 15 à cause d'un lien hors-sujet, écarté après
  vérification). Même famille de balisage que prefecture-37/41/45/49/55,
  avec subdivision mensuelle ici (contrairement à 49/52/55 qui listent
  toute l'année sur une seule page).
- Lien PDF direct, pas de `page_detail`.
- Signataire confirmé par décret de nomination (Légifrance) : Mme Nadège
  BAPTISTA, préfète de la Mayenne (décret du 30 juillet 2025).

Fixtures synthétiques (`recueil-53-2026-180.pdf` pertinent,
`recueil-53-2026-166.pdf` non pertinent) — hrefs/format réalistes issus
de la capture live, texte des PDF reconstruit.
