# Source réelle — prefecture-29 (Finistère)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.finistere.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `-{annee}`, ex. `Recueils-publies-en-2026`).
- **Page de l'année (`Recueils-publies-en-2026`)** : DÉJÀ la liste complète (pas de découpage par mois, comme prefecture-16/25) : chaque bulletin est un `<div class="">` (imbriqué dans une structure de `<table>`) contenant un unique `<a class="fr-link fr-link--download">` avec lien PDF DIRECT. 168 bulletins recensés pour 2026 au moment de la capture (14/08/2026 inclus, jusqu'à `RAA 29-2026-173`), en ordre chronologique DÉCROISSANT.
- Page NON paginée (aucun `fr-pagination` détecté malgré les 168 bulletins).
- Aucun `id=` vide/malformé détecté.

## PIÈGE DÉCOUVERT : `div:has()` matche aussi les ancêtres

Comme prefecture-26/28 (même session) : `div:has(a.fr-link--download)` seul matche aussi les `<div>` ancêtres du lien, pas seulement le `<div class="">` immédiat — vérifié contre la page réelle capturée : 173 correspondances pour seulement 168 bulletins réels. `selecteur_publications` cible donc `div[class=""]:has(a.fr-link--download)` — 168/168 correspondances exactes vérifiées.

## Signataire réel

Confirmé par le logo textuel DSFR de la page racine : « Préfet<br />du Finistère » (masculin).

## LIMITE DE CAPTURE

Comme prefecture-27/28, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (connexion TLS fermée sans réponse) — aucun vrai PDF n'a pu être échantillonné, malgré deux bulletins du 14/08/2026 (`RAA 29-2026-173`, `172 nominatifs`) dont le titre seul ne permet pas de préjuger du contenu. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`recueils-publies-en-2026.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 168 bulletins réels de l'année au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs des bulletins (173, 172, 171) sont les VRAIES URLs capturées ; seul le contenu des deux PDF de test est synthétique.
