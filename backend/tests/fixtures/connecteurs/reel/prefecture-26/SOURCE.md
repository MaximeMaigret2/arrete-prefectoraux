# Source réelle — prefecture-26 (Drôme)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.drome.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`), href NE se terminant PAS par l'année (ex. `.../RAA-2026-consulter-le-recueil-des-services-de-l-Etat-dans-la-Drome`) — motif `RAA-{annee}-consulter` (substring) plutôt que l'ancrage `{annee}$` habituel, pour rester spécifique.
- **Page de l'année (`RAA-2026-consulter-...`)** : liste une carte DSFR par MOIS (`.fr-card__title a`). Tous les mois de Janvier à Octobre sont déjà des cartes au moment de la capture (y compris des mois futurs, Septembre/Octobre 2026). Href se termine par `{Mois}-{annee}` pour la plupart (ex. `Aout-2026`) SAUF Janvier, qui porte un suffixe supplémentaire (`Janvier-2026-RAA`) — motif `{mois_fr}-{annee}` SANS ancrage `$` pour rester valide toute l'année. Navigation à DEUX niveaux (racine → année → mois).
- **Page du mois (`Aout-2026`)** : chaque bulletin est un `<div class="">` contenant un unique `<a class="fr-link fr-link--download">` avec lien PDF DIRECT — même famille que prefecture-21/23/25. 15 bulletins recensés pour août 2026 au moment de la capture (14/08/2026 inclus, jusqu'à `recueil-26-2026-264`).
- Page NON paginée (15 bulletins sur une seule page).
- Aucun `id=` vide/malformé détecté (les `id=` portent des valeurs hexadécimales normales).

## PDF réels échantillonnés (6 des plus récents d'août 2026)

Aucun arrêté anti rave-party réel trouvé, malgré 3 arrêtés signés le jour même de la capture (14/08/2026) :

- `recueil-26-2026-264` (14/08) : arrêté portant **interdiction du spectacle de M. Dieudonné M'Bala M'Bala** le 14 août 2026 (urgence, appels sur réseaux sociaux à un rassemblement dont le lieu n'était pas précisé — thématiquement proche mais PAS un rassemblement musical non déclaré de type rave/teknival).
- `recueil-26-2026-263` (14/08) : arrêté **autorisant un spectacle aérien public de drones** à Saint-Sorlin-en-Valloire les 20-21 août 2026.
- `recueil-26-2026-262` (14/08, spécial) : arrêté portant **interdiction des feux d'artifice** du 17 au 31 août 2026 (risque incendie, canicule/sécheresse).
- `recueil-26-2026-261`/`259`/`255` : arrêtés DDT (Direction Départementale des Territoires), sans rapport.

## Signataire réel

Confirmé par l'en-tête de 2 arrêtés réels (264, 262) : « **La préfète de la Drôme** » (Madame Marie-Aimée GASPARI, nommée par décret du 30 juillet 2025 à compter du 1er septembre 2025). Les arrêtés récents sont en pratique signés par délégation (« Pour la préfète, Le secrétaire général, Cyril MOREAU ») mais l'autorité de tête reste « La préfète de la Drôme ».

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun mot-clé rave/teknival/rassemblement musical trouvé dans les 6 PDF réels échantillonnés (contrairement à prefecture-23/25, déployés lors de la session précédente). `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont donc **synthétiques** (`reportlab`), la formulation exacte d'un vrai arrêté anti rave-party de la Drôme demeurant non vérifiée — comme la majorité des connecteurs déployés.

`racine.html`/`annee-2026.html`/`aout-2026.html` ne reproduisent que quelques éléments (sur 3 cartes racine / 10 cartes année / 15 bulletins réels du mois au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. Les URLs des bulletins `aout-2026.html` (264, 263, 260) sont les VRAIES URLs capturées ; seul le contenu des deux PDF de test (`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf`, associés respectivement aux URLs réelles de 264 et 263 dans `reel-prefecture-26.test.ts`) est synthétique, le contenu réel de ces deux bulletins (Dieudonné, drones) ne démontrant pas le chemin d'extraction nominal recherché par ce test.
