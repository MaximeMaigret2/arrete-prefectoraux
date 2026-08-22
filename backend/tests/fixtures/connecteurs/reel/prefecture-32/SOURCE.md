# Source réelle — prefecture-32 (Gers)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.gers.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `edites-en-{annee}`). Coquille du site notée pour 2023 (`...edites-en-20232`) — sans incidence pour 2026.
- **Page de l'année (`Recueils-des-actes-administratifs-edites-en-2026`)** : DÉJÀ la liste complète (199 bulletins au moment de la capture), mais structurée en VRAI `<table>` HTML — PARTICULARITÉ NOUVELLE parmi les 33 connecteurs déployés jusque-là (aucun autre connecteur ne s'appuie sur un `<table>`/`<tr>`/`<td>` réel ; tous les autres utilisent des cartes DSFR ou des `<div>`/`<li>` de liste). Chaque `<tr>` porte : `<td>` numéro (ex. `32.2026.135`), `<td>` date de publication, `<td>` contenant le lien PDF direct enveloppé dans un `<div class="">` (`<a class="fr-link fr-link--download">`, texte "Télécharger le document" + taille/date en `<span class="fr-link__detail">`, sans aucune information de contenu).
- **Piège `:has()` par remontée d'ancêtres, retrouvé DÈS la capture initiale** (même famille que 23/25/26/28/29/30) : `div:has(a.fr-link--download)` matche 205 correspondances contre la page réelle, pour seulement 199 liens réels (`a.fr-link--download` compté directement). `selecteur_publications` qualifié en `div[class='']:has(a.fr-link--download)` dès la conception de ce connecteur (199/199 exact) — jamais déployé avec le sélecteur non qualifié, à la différence de 23/25 qui ont dû être corrigés rétroactivement au lot 31-36.
- Page NON paginée (199 lignes de `<table>` pour 2026, toutes sur une seule page HTML).

## Signataire réel

Non confirmé par un vrai PDF (téléchargement bloqué, cf. ci-dessous). Confirmé par recherche web (poste occupé au 2026-08-14) : préfet du Gers = M. Alain CASTANIER (masculin) — `autorite_signataire: "Le préfet du Gers"`.

## LIMITE DE CAPTURE

Comme la majorité des connecteurs du lot 26-30, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (HTTP 503 immédiat, 118 octets de corps de réponse). Testé sur 2 bulletins distincts (32.2026.135 et 32.2026.106). Aucun vrai PDF n'a pu être échantillonné. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`recueils-2026.html` ne reproduisent que quelques éléments (sur 3 cartes racine / 199 lignes réelles du tableau de l'année au moment de la capture) — une reconstruction fidèle de la structure `<table>` observée en direct, pas un dump complet de chaque page. Les URLs/numéros/dates des 2 bulletins choisis (32.2026.135, 32.2026.106) sont les VRAIES valeurs capturées ; seul le contenu des deux PDF de test est synthétique.
