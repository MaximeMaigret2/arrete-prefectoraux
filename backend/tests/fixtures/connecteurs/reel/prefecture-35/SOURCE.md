# Source réelle — prefecture-35 (Ille-et-Vilaine)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.ille-et-vilaine.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste 3 cartes DSFR (`.fr-card__title a`) : « Recueil des actes administratifs 2025 » (URL avec coquille `-20252`, sans incidence), « Archives des recueils des actes administratifs » et « Recueil des actes administratifs 2026 » (href se terminant proprement par `-2026`). `pattern_lien: "-administratifs-{annee}$"` cible sans ambiguïté la carte de l'année courante.
- **Page de l'année (`Recueil-des-actes-administratifs-2026`)** : DÉJÀ la liste complète (231 liens `a.fr-link--download` au moment de la capture), chaque bulletin étant un `<div class="">` contenant un unique `<a class="fr-link fr-link--download">` avec un titre INFORMATIF (ex. "Télécharger RAA-35-2026-240 du 14 août 2026") + lien PDF DIRECT.
- **Piège `:has()` par remontée d'ancêtres, retrouvé DÈS la capture initiale** (même famille que 23/25/26/28/29/30/32/34) : `div:has(a.fr-link--download)` matche 234 correspondances contre la page réelle, pour seulement 231 liens réels. `selecteur_publications` qualifié en `div[class='']:has(a.fr-link--download)` dès la conception de ce connecteur (231/231 exact).
- Page NON paginée (231 bulletins de 2026 au moment de la capture, tous sur une seule page HTML).
- Bulletin le plus récent au moment de la capture : RAA-35-2026-240 du 14 août 2026 — le jour même du déploiement de ce connecteur, la même semaine que les arrêtés anti rave-party réels confirmés en Creuse (23) et dans le Doubs (25).

## Signataire réel

Non confirmé par un vrai PDF (téléchargement bloqué, cf. ci-dessous). Confirmé par décret de nomination (Légifrance, 24 juin 2026) : préfète d'Ille-et-Vilaine = Mme Emmanuelle DUBÉE (féminin) — `autorite_signataire: "La préfète d'Ille-et-Vilaine"`.

## LIMITE DE CAPTURE

Comme la majorité des connecteurs du lot 26-30, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (HTTP 503 immédiat). Testé sur 2 bulletins distincts (RAA-35-2026-240 et RAA-35-2026-239), y compris le bulletin le plus récent disponible au moment de la capture. Aucun vrai PDF n'a pu être échantillonné. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`recueil-2026.html` ne reproduisent que quelques éléments (sur 3 cartes racine / 231 bulletins réels de l'année au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs/titres des 2 bulletins choisis (RAA-35-2026-240, RAA-35-2026-239) sont les VRAIES valeurs capturées ; seul le contenu des deux PDF de test est synthétique.
