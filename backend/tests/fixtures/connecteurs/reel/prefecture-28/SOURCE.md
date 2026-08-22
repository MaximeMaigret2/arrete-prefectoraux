# Source réelle — prefecture-28 (Eure-et-Loir)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.eure-et-loir.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `administratifs-{annee}`).
- **Page de l'année (`Recueil-des-actes-administratifs-2026`)** : liste une carte DSFR par MOIS (`.fr-card__title a`, href se terminant simplement par le nom du mois SANS l'année, ex. `.../Aout`). Les 8 mois écoulés (Janvier à Août) sont déjà des cartes au moment de la capture (mois futurs absents, contrairement à prefecture-26).
- **Page du mois (`Aout`)** : liste directement TOUS les actes administratifs individuels du mois (pas seulement des "recueils" groupés) comme des `<div class="">` (imbriqués dans une structure de `<table>`) contenant chacun un unique `<a class="fr-link fr-link--download">`. 23 actes recensés pour août 2026 au moment de la capture (14/08/2026 inclus), noms de fichiers très hétérogènes (délégations de signature, arrêtés isolés, récépissés — jamais de convention "recueil-28-2026-NNN" uniforme).
- Page NON paginée pour ce mois (aucun `fr-pagination` détecté).
- Aucun `id=` vide/malformé détecté.

## PIÈGE DÉCOUVERT : `div:has()` matche aussi les ancêtres

Comme prefecture-26 (même session) : `div:has(a.fr-link--download)` seul matche aussi les `<div>` ancêtres du lien (`.fr-container#main`, `.fr-grid-row`, etc.), pas seulement le `<div class="">` immédiat — vérifié contre la page réelle capturée : 28 correspondances pour seulement 23 actes réels. `selecteur_publications` cible donc `div[class=""]:has(a.fr-link--download)` (attribut `class` exactement vide) — 23/23 correspondances exactes vérifiées.

## Signataire réel

Confirmé par le logo textuel DSFR de chaque carte de la page racine : « Préfet<br />d'Eure-et-Loir » (masculin).

## LIMITE DE CAPTURE

Comme prefecture-27 (Eure), le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (connexion TLS fermée sans réponse) — aucun vrai PDF n'a pu être échantillonné, malgré plusieurs actes du 14/08/2026 dont le titre seul ne permet pas de préjuger du contenu. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`annee-2026.html`/`aout.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 2 cartes année / 23 actes réels du mois au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs des actes `aout.html` sont les VRAIES URLs capturées ; seul le contenu des deux PDF de test est synthétique.
