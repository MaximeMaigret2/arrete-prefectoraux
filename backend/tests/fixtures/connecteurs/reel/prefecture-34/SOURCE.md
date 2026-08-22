# Source réelle — prefecture-34 (Hérault)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.herault.gouv.fr/Publications/Recueils-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `administratifs-{annee}`) + une carte DÉCOYE sans rapport (« Arrêté massif jusqu'au 30 septembre 2024 », URL se terminant aussi par `-2024`) — `pattern_lien: "-actes-administratifs-{annee}$"` cible spécifiquement les cartes RAA annuelles.
- **Page de l'année (`Recueil-des-actes-administratifs-2026`)** : DÉJÀ la liste complète (235 liens `a.fr-link--download` au moment de la capture). PARTICULARITÉ : la page comporte aussi 235 AUTRES liens (classe différente, non identifiée précisément) pointant vers les MÊMES fichiers `/contenu/telechargement/...` — total 470 liens `<a href*=telechargement>`, mais seulement 235 de classe `fr-link fr-link--download` — `selecteur_lien_pdf: "a.fr-link--download"` cible sans ambiguïté la bonne moitié.
- Chaque bulletin est un `<div class="">` contenant un unique `<a class="fr-link fr-link--download">` avec un titre INFORMATIF (ex. "Télécharger Recueil n°211 du 14 août 2026 - Partie 2") — contrairement à 32/Gers, le titre porte ici une date exploitable, mais reste jamais suffisant seul pour juger de la pertinence (RAA compilé, plusieurs arrêtés par PDF).
- **Piège `:has()` par remontée d'ancêtres, retrouvé DÈS la capture initiale** (même famille que 23/25/26/28/29/30/32) : `div:has(a.fr-link--download)` matche 238 correspondances contre la page réelle, pour seulement 235 liens réels. `selecteur_publications` qualifié en `div[class='']:has(a.fr-link--download)` dès la conception de ce connecteur (235/235 exact).
- Page NON paginée (235 bulletins de 2026 au moment de la capture, tous sur une seule page HTML).
- Bulletin le plus récent au moment de la capture : « Recueil n°211 du 14 août 2026 », publié en 2 parties (Partie 1 : 25,59 Mb, Partie 2 : 31,79 Mb) — le jour même du déploiement de ce connecteur, la même semaine que les arrêtés anti rave-party réels confirmés en Creuse (23) et dans le Doubs (25).

## Signataire réel

Non confirmé par un vrai PDF (téléchargement bloqué, cf. ci-dessous). Confirmé par décret de nomination (Légifrance, 2 décembre 2025) : préfète de l'Hérault = Mme Chantal MAUCHET (féminin) — `autorite_signataire: "La préfète de l'Hérault"`.

## LIMITE DE CAPTURE

Comme la majorité des connecteurs du lot 26-30, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (HTTP 503 immédiat). Testé sur les 2 parties du bulletin n°211 (14/08/2026), y compris le bulletin le plus récent disponible au moment de la capture. Aucun vrai PDF n'a pu être échantillonné. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`recueil-2026.html` ne reproduisent que quelques éléments (sur 11 cartes racine / 235 bulletins réels de l'année au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs/titres des 2 bulletins choisis (Recueil n°211, Parties 1 et 2) sont les VRAIES valeurs capturées ; seul le contenu des deux PDF de test est synthétique.
