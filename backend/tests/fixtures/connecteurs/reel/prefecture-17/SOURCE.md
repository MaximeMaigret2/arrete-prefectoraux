# Source réelle — prefecture-17 (Charente-Maritime)

**Capturé le** : 2026-08-14, par `fetch`/`curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.charente-maritime.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs`

Note : contrairement à 04/10/15, l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié par `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine — structure NOUVELLE parmi les 19 connecteurs à ce jour** : ne liste ses années qu'à travers un `<select>` de formulaire (`<option value="Publications/RAA-Recueil-des-Actes-Administratifs/Annee-2026" title="Année 2026">`, valeur SANS `/` de tête, comme déjà vu sur prefecture-77) — **aucun `<a href>` équivalent n'existe ailleurs sur la page racine** (vérifié : c'est le seul `<select>`/`<option>` de la page, 21 options au total dont le placeholder désactivé). La `value` de l'`<option>` répond `200` en GET direct (vérifié par `curl`), confirmant que la navigation par formulaire est un simple raccourci UX — la ressource est bien atteignable par une requête GET normale une fois son URL connue.
- Jusqu'ici, lire un attribut autre que `href` n'était possible que pour `page_detail.attribut_lien` (résolution du PDF depuis une page de détail, cf. prefecture-77) — jamais pour une étape de `navigation` elle-même (qui atteint une page LISTE, pas un PDF). Ici, c'est la toute PREMIÈRE étape de navigation (racine → année) qui a besoin de lire `value` : extension minimale du moteur, `navigation[].attribut_lien` (V011, Phase 5bis élargie 4, 2026-08-14, cf. `contracts/connecteur-interface.md` §2quinquies), même idiome et même défaut (`href`) que `page_detail.attribut_lien`.
- **Page de l'année (`Annee-2026`), atteinte via cette navigation** : structure `.fr-card` CLASSIQUE (comme prefecture-01/33/77), chaque carte (`div.fr-card`) contenant un lien DIRECT vers le PDF (`h2.fr-card__title > a`, href se terminant par `.pdf`) — vérifié par `curl -I` que l'URL cible répond `Content-Type: application/pdf`. **Pas de page de détail intermédiaire** ici, contrairement à prefecture-16/77.
- Ordre chronologique **décroissant** (le plus récent en tête : 13/08/2026, 13/08/2026, 12/08/2026, 12/08/2026, 10/08/2026...) et **paginée** (28 pages de 10 bulletins, ~280 bulletins/an au moment de la capture) : comme prefecture-01/03/13/33, la première page suffit déjà à couvrir les publications les plus récentes — pas besoin d'étape de navigation supplémentaire vers une « dernière page » (contrairement à prefecture-02/05, dont l'ordre croissant impose ce détour).
- Texte des liens ("Recueil-26-08-13-285-nominatifs"...) : ne contient jamais de mot-clé rave/teknival — comme tous les connecteurs précédents dont le nom de bulletin ne reflète jamais son contenu réglementaire.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 17-2026-08-285-001`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-17.yaml`), mais la formulation exacte d'un vrai bulletin RAA de la Charente-Maritime reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-17.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → année via `value` d'un `<select>` → liste `.fr-card` avec PDF direct → scan de contenu), pas la formulation exacte du texte réglementaire.

`racine.html`/`annee-2026.html` ne reproduisent que quelques éléments (sur 21 options d'années / ~280 cartes réelles au moment de la capture) — une reconstruction fidèle des classes/attributs/structure observés en direct, pas un dump complet de chaque page.
