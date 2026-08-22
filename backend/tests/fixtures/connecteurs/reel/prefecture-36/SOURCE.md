# Source réelle — prefecture-36 (Indre)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.indre.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `{annee}`) + une carte « Archives » sans rapport. `pattern_lien: "{annee}$"` cible sans ambiguïté l'année courante.
- **Page de l'année (`2026`)** : liste une carte DSFR par MOIS, préfixée d'un numéro à 2 chiffres (ex. « 08. Aout 2026 » → href `.../08.-Aout-2026`). Les mois futurs non encore publiés (ex. « 09. Septembre ») n'ont pas le suffixe `-{annee}` — sans incidence, le mois courant l'a toujours.
- **Page du mois (`08.-Aout-2026`)** : chaque bulletin est une VRAIE carte DSFR complète (`.fr-card`, comme prefecture-31/Haute-Garonne), lien PDF direct porté par `.fr-card__title a` (classe `fr-card__link menu-item-link`, différente de la famille `fr-link fr-link--download`). PAGINÉE (`fr-pagination`, 10 bulletins/page).
- **Ordre chronologique CROISSANT** (le plus ancien en tête) — À LA DIFFÉRENCE DE prefecture-31 (décroissant) : vérifié le 14/08/2026, page 1 = bulletins n°212 à 221 (01/08 au 09/08), page 2 (= « Dernière page », seule autre page existante) = bulletins n°222 à 228 (10/08 au 14/08 inclus, plusieurs bulletins spéciaux publiés le jour même). Les bulletins les plus récents ne sont donc JAMAIS sur la page 1 pour ce site.
- **Lien « Dernière page »** : classe `fr-pagination__link--last`, présent et pointant vers `.../08.-Aout-2026/(offset)/10` — utilisé comme 3e étape de `navigation` (`optionnelle: true`, NOUVELLE utilisation de V010 : jusqu'ici seulement pour une pagination absente ; ici pour choisir délibérément la dernière page plutôt que la première).

## Signataire réel

Non confirmé par un vrai PDF (téléchargement bloqué, cf. ci-dessous). Confirmé par décret de nomination (Légifrance, 8 avril 2026) : préfète de l'Indre = Mme Maryvonne LE BRIGNONEN (féminin) — `autorite_signataire: "La préfète de l'Indre"`.

## LIMITE DE CAPTURE

Comme la majorité des connecteurs du lot 26-30, le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session (HTTP 503 immédiat). Testé sur 3 bulletins distincts (n°226, n°228, n°224), tous publiés le 14/08/2026 même — le jour du déploiement de ce connecteur, la même semaine que les arrêtés anti rave-party réels confirmés en Creuse (23) et dans le Doubs (25). Aucun vrai PDF n'a pu être échantillonné. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc synthétiques (`reportlab`) ; `patterns_dates`/`pattern_reference` reprennent l'hypothèse générique déjà posée pour la plupart des connecteurs précédents.

`racine.html`/`2026.html`/`08.-Aout-2026.html`/`08.-Aout-2026-offset-10.html` ne reproduisent que quelques éléments (sur 7 cartes racine / 12 cartes mensuelles / 21 bulletins réels du mois au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs/titres des bulletins choisis (n°226, n°225, n°212 pour la page 1) sont les VRAIES valeurs capturées ; seul le contenu des deux PDF de test est synthétique.
