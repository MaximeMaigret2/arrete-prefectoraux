# Source réelle — prefecture-31 (Haute-Garonne)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.haute-garonne.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste DEUX cartes DSFR (`.fr-card__title a`) — « Recueil des Actes Administratifs (Haute-Garonne) » et « ... (Occitanie) » — la racine couvre aussi le niveau régional, comme prefecture-21/2A. `pattern_lien: "Haute-Garonne$"` cible spécifiquement la carte départementale.
- **Page « Haute-Garonne »** : liste une carte DSFR par MOIS (`.fr-card__title a`, href se terminant par `{mois_fr}-{annee}`, ex. `Aout-2026`) — 137 cartes au moment de la capture (mois depuis 2016).
- **Page du mois (`Aout-2026`)** : chaque bulletin est une VRAIE carte DSFR complète (`.fr-card`, `.fr-card__title` en `<h2>`), avec le lien PDF DIRECT porté par `.fr-card__title a` — PARTICULARITÉ NOUVELLE parmi les 33 connecteurs déployés jusque-là : aucun `div class=""`/`<li>` autour d'un `a.fr-link--download`, mais une carte complète comme sur la page racine/mois elle-même. `selecteur_publications: ".fr-card"` — 10/10 correspondances exactes contre `.fr-card__title a` sur la page réelle, sans risque de sur-matching par ancêtres (`.fr-card` est une classe directe unique par carte, pas un sélecteur `:has()`).
- **Ordre chronologique DÉCROISSANT** (le plus récent en tête) — vérifié : bulletin n°466 du 14/08/2026 en position 0 de la page 1. Page PAGINÉE (`fr-pagination`, 10 bulletins/page), mais comme l'ordre est décroissant, les bulletins les plus récents du mois courant restent toujours sur la page 1 — aucune étape de pagination supplémentaire nécessaire (à la différence de prefecture-36/Indre, dont l'ordre est croissant).
- Aucun `id=` vide/malformé détecté sur les liens de la page du mois (contrairement à 2A/2B).

## Signataire réel

Non confirmé par un vrai PDF (téléchargement bloqué, cf. ci-dessous). Confirmé indirectement via le décret de nomination le plus récent (Légifrance, décret du 27 mai 2026) : préfet actuel de la Haute-Garonne = M. Fabrice RIGOULET-ROZE (masculin) — `autorite_signataire: "Le préfet de la Haute-Garonne"`.

## LIMITE DE CAPTURE

Comme la majorité des connecteurs du lot 26-30, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session : `curl` → `Recv failure: Connection reset by peer` ; `fetch` Node → HTTP 503 immédiat (118 octets de corps de réponse, probablement une page WAF). Testé sur 2 bulletins distincts (n°466 et n°465). Aucun vrai PDF n'a pu être échantillonné. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`Recueil-des-Actes-Administratifs-Haute-Garonne.html`/`Aout-2026.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 137 cartes mensuelles / 10+ bulletins réels du mois au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs et titres des bulletins choisis (n°465, n°462) sont les VRAIES URLs/titres capturés ; seul le contenu des deux PDF de test est synthétique.
