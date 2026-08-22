# Source réelle — prefecture-52 (Haute-Marne)

Capture live (navigateur Chrome réel, `mcp__claude-in-chrome__*`) le 2026-08-19
(lot 52-56), **avant** l'écriture de la config (même méthode que les lots
précédents).

- Racine : `.fr-card__title a` — 1 niveau, `Annee-{annee}$` (ex. cartes
  "Année 2026", "Année 2025"... jusqu'à 2007).
- Page de l'année : liste PLATE, 100 publications au 2026-08-19 (comptage
  exact en live). PIÈGE DE MARKUP réel : les 5 plus récentes sont chacune
  dans leur propre `<p>` sans classe ; les 95 suivantes sont des `<li>`
  ORPHELINS — confirmé par `fetch()` direct depuis le navigateur (16 `<p>`
  ouvrants pour 100 occurrences du lien de téléchargement dans le HTML
  brut renvoyé par le serveur). Transition vérifiée entre "RAA n° 86" (p)
  et "RAA n° 85" (li), les deux groupes partageant le même conteneur
  parent `div.fr-col-12.fr-col-md-8`.
- **Vérifié directement avec cheerio** (pas seulement en DOM navigateur,
  qui aurait auto-corrigé la structure en insérant un `<ul>` implicite —
  cheerio/htmlparser2 ne le fait pas) : les `<li>` orphelins restent des
  enfants directs du même conteneur que les `<p>`, d'où le sélecteur
  combiné `p:not([class]):has(a.fr-link), li:has(a.fr-link)`.
- Faux positif évité : les liens de skip-navigation de l'en-tête DSFR
  ("Aller au contenu"...) sont aussi des `<li>` contenant un `a.fr-link` —
  d'où le scoping explicite sur `.fr-col-12.fr-col-md-8` (vérifié avec
  cheerio sur une structure synthétique incluant le skip-link en décoy).
- Lien PDF direct dans l'ancre (classe `fr-link` seule, pas de
  `--download`) : `selecteur_lien_pdf: "a.fr-link"`, pas de `page_detail`.
- Href brut NON encodé (espaces, "n°" littéraux dans l'URL, ex.
  `.../file/RAA n° 89 du 17-08-2026.pdf`) — `resoudreUrl` (moteur.ts,
  `new URL()`) les encode automatiquement, vérifié sans erreur.
- Signataire confirmé par décret de nomination (Légifrance) : Mme Régine
  PAM, préfète de la Haute-Marne (décret du 13 juillet 2023, toujours en
  poste — cf. décret du 26 novembre 2025 nommant son directeur de
  cabinet, aucun décret de remplacement de la préfète trouvé).

Fixtures synthétiques (`recueil-52-2026-0876.pdf` pertinent,
`recueil-52-2026-0870.pdf` non pertinent) — hrefs/format réalistes issus
de la capture live, texte des PDF reconstruit (aucun outil de cette
session ne permet de lire le contenu binaire d'un vrai PDF).
