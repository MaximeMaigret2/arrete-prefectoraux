# Source réelle — prefecture-30 (Gard)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.gard.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `-{annee}`, ex. `Recueil-des-actes-administratifs-2026`).
- **Page de l'année (`Recueil-des-actes-administratifs-2026`)** : DÉJÀ la liste complète (pas de découpage par mois, comme prefecture-16/25/29) : chaque bulletin est un `<div class="">` (imbriqué dans une structure de `<table>`, comme prefecture-29) contenant un unique `<a class="fr-link fr-link--download">` avec lien PDF DIRECT. 175 bulletins recensés pour 2026 au moment de la capture (jusqu'à `recueil-30-2026-178`, 14/08/2026), en ordre chronologique CROISSANT (le plus ancien en tête, à la différence de 29/Finistère) — les plus récents restent accessibles en fin de page, vérifié.
- Page NON paginée (aucun `fr-pagination` détecté malgré les 175 bulletins).
- Aucun `id=` vide/malformé détecté.

## PIÈGE DÉCOUVERT : `div:has()` matche aussi les ancêtres

Comme prefecture-26/28/29 (même session) : `div:has(a.fr-link--download)` seul matche aussi les `<div>` ancêtres du lien, pas seulement le `<div class="">` immédiat — vérifié contre la page réelle capturée : 180 correspondances pour seulement 175 bulletins réels. `selecteur_publications` cible donc `div[class=""]:has(a.fr-link--download)` — 175/175 correspondances exactes vérifiées.

## Signataire réel

Confirmé par le logo textuel DSFR de la page racine : « Préfete<br />du Gard » (féminin — le logo omet l'accent grave, orthographe corrigée en « Préfète » dans `autorite_signataire`, comme la coquille déjà rencontrée sur prefecture-25/Doubs).

## LIMITE DE CAPTURE

Comme prefecture-27/28/29, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (connexion TLS fermée sans réponse) — aucun vrai PDF n'a pu être échantillonné, malgré un bulletin très récent (`recueil-30-2026-178-special du 14 08 2026`) dont le titre seul ne permet pas de préjuger du contenu. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`recueil-des-actes-administratifs-2026.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 175 bulletins réels de l'année au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs des bulletins (176, 177, 178) sont les VRAIES URLs capturées ; seul le contenu des deux PDF de test est synthétique.
