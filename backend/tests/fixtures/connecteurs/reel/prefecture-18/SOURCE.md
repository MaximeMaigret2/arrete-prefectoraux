# Source réelle — prefecture-18 (Cher)

**Capturé le** : 2026-08-14, par `curl`/`fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.cher.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA-Arretes-et-circulaires`

Note : comme prefecture-17 (et contrairement à 04/10/15), l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : contient une SEULE carte DSFR (`div.fr-card h2.fr-card__title a`) menant à la page qui liste réellement les publications
  (`.../Recueil-des-actes-administratifs-RAA-Arretes-et-circulaires/Recueil-des-actes-administratifs`) — le reste de la page est menu/mega-menu générique du site (d'autres liens portent le même libellé "Recueil des actes administratifs" ailleurs sur la page, mais avec un `href` différent qui ne termine pas par `/Recueil-des-actes-administratifs`, donc sans ambiguïté avec `pattern_lien: "/Recueil-des-actes-administratifs$"`).
- **Page suivante** : liste une carte DSFR par ANNÉE (`div.fr-card h2.fr-card__title a`, href se terminant par l'année, ex. `.../Recueil-des-actes-administratifs/2026`), 2015 à 2026 au moment de la capture — même famille de structure que prefecture-01/13/33/77.
- **Page de l'année** : liste une carte DSFR par MOIS (même sélecteur, href se terminant par le nom du mois français capitalisé SANS accent, ex. `.../2026/Aout`, `.../2026/Fevrier`) — directement compatible avec le placeholder `{mois_fr}` existant (`NOMS_MOIS_FR`), aucune extension nécessaire.
- **Page du mois (`Aout`)** : STRUCTURE NOUVELLE parmi les 20 connecteurs à ce jour pour la liste finale — chaque publication est un `<p>` (pas un `<div>` comme prefecture-01, ni un `.fr-card` comme prefecture-13/17/33/77) au sein d'un unique `div.fr-text--lead.fr-my-3w`, contenant un unique `<a class="fr-link fr-link--download">` qui porte À LA FOIS le titre et le lien PDF DIRECT (`href` se terminant par `.pdf`, vérifié par le nommage cohérent des 17 bulletins réels du mois au moment de la capture) — pas de page de détail intermédiaire. Le sélecteur générique `selecteur_publications: "div.fr-text--lead p"` couvre cette structure sans aucune extension moteur (même mécanisme que `selecteur_titre`/`selecteur_lien_pdf` = `a.fr-link--download`, comme prefecture-01). Cette page n'est PAS paginée (17 bulletins d'août 2026 tous listés sur une seule page au moment de la capture).
- Ordre chronologique **décroissant** (le plus récent en tête : 14/08/2026, 13/08/2026×2, 13/08/2026...) : comme prefecture-01/03/13/17/33, la première page du mois courant suffit déjà — pas besoin d'étape de navigation supplémentaire vers une « dernière page » ou une pagination.
- Texte du lien ("Recueil des actes administratifs [spécial|nominatif] n° 18-2026-08-XXX publié le DD mois AAAA") : ne contient jamais de mot-clé rave/teknival, même quand le bulletin en contient un — comme tous les connecteurs précédents.
- **Navigation à 3 niveaux** (racine → page « Recueil des actes administratifs » → année → mois) : nouveau parmi les 20 connecteurs à ce jour (jusqu'ici maximum 2 niveaux, ex. prefecture-01/33), mais chaque étape n'utilise que `pattern_lien` avec ancrage `$` et l'attribut `href` par défaut — AUCUNE extension moteur nécessaire (le moteur `page_web` boucle déjà sur un nombre arbitraire d'étapes de `navigation`, cf. `resoudreNavigation`).

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 18-2026-08-017-001`, `à compter du 14/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-18.yaml`), mais la formulation exacte d'un vrai bulletin RAA du Cher reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-18.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → « Recueil » → année → mois → liste `<p><a>` avec PDF direct → scan de contenu), pas la formulation exacte du texte réglementaire.

`racine.html`/`annees.html`/`annee-2026.html`/`aout-2026.html` ne reproduisent que quelques éléments (sur 1 carte racine / 12 cartes année / 12 cartes mois / 17 bulletins réels du mois au moment de la capture) — une reconstruction fidèle des classes/attributs/structure observés en direct, pas un dump complet de chaque page.
