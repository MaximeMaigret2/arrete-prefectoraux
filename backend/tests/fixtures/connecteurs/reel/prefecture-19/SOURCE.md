# Source réelle — prefecture-19 (Corrèze)

**Capturé le** : 2026-08-14, par `curl`/`fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.correze.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : comme prefecture-17/18 (et contrairement à 04/10/15), l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `annee-{annee}`, ex. `.../Recueil-des-actes-administratifs/RAA-annee-2026`), 2015 à 2026 au moment de la capture (les années récentes utilisent `RAA-annee-2026` en minuscules, les plus anciennes `RAA-Annee-2019` avec un A majuscule — sans incidence sur le pattern, compilé avec le flag `i`) — même famille de structure que prefecture-01/13/18/33/77. Un menu latéral (`fr-sidemenu__link`) répète les mêmes libellés/URLs ailleurs sur la page mais avec une classe différente, sans ambiguïté avec le sélecteur `.fr-card__title a` scopé aux cartes.
- **Page de l'année (`RAA-annee-2026`)** : STRUCTURE NOUVELLE parmi les 21 connecteurs à ce jour — contrairement à prefecture-01/18 (racine → année → MOIS, page de mois séparée), la page de l'année liste ICI DIRECTEMENT tous les bulletins de l'année entière, regroupés visuellement par des en-têtes `<p>Janvier</p>`, `<p>Août</p>`, etc. (purement indicatifs, aucun sélecteur ne s'appuie dessus) au sein d'un unique `div.fr-text--lead.fr-my-3w`. Chaque bulletin est un `<li>` (pas un `<p>` comme 18, ni un `<div>` comme 01, ni un `.fr-card` comme 13/17/33/77) contenant un unique `<a class="fr-link fr-link--download">` qui porte à la fois le titre ET le lien PDF DIRECT (`href` se terminant par `.pdf`) — pas de page de détail intermédiaire. Couverte telle quelle par `selecteur_publications: "div.fr-text--lead li"` / `selecteur_titre`/`selecteur_lien_pdf: "a.fr-link--download"`, AUCUNE extension moteur nécessaire (un sélecteur CSS déclaratif de plus, comme pour 01/18).
- **Navigation à UN SEUL niveau** (racine → année) : le plus court observé à ce jour parmi les 21 connecteurs (jusqu'ici toujours au moins 2 niveaux, ex. prefecture-01/33, jusqu'à 3 pour 18) — parce que le site ne segmente pas la liste par mois sur une page séparée, contrairement au Cher/à l'Ain.
- 125 bulletins recensés pour l'année 2026 au moment de la capture (14/08/2026), TOUS sur une seule page HTML sans pagination (vérifié : aucune classe `.fr-pagination`/`.pagination` sur la page) — le dernier bulletin en date (`recueil-19-2026-125`) correspond bien au 14/08/2026, confirmant la fraîcheur de la source.
- Ordre chronologique **croissant** au sein de chaque mois (contrairement à prefecture-01/03/13/17/18/33 qui affichent le plus récent en tête) — sans incidence sur le connecteur : le moteur `page_web` parcourt tous les éléments de `selecteur_publications` sans hypothèse d'ordre.
- Texte du lien ("Raa [spécial] 19-2026-XXX du DD mois AAAA") : ne contient jamais de mot-clé rave/teknival, même quand le bulletin en contient un — comme tous les connecteurs précédents, d'où le recours systématique au scan du contenu PDF.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` (Python) pour reproduire un texte plausible d'arrêté (`Arrêté n° 19-2026-124-001`, `à compter du 14/08/2026`, `jusqu'au 17/08/2026`, conformes aux patterns de `prefecture-19.yaml`), mais la formulation exacte d'un vrai bulletin RAA de la Corrèze reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent (ex. `recueil-19-2026-124-...pdf`, `recueil-19-2026-125-...pdf`, présents en clair sur la page de l'année 2026) et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-19.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → année → liste `<li><a>` avec PDF direct → scan de contenu), pas la formulation exacte du texte réglementaire.

`racine.html`/`annee-2026.html` ne reproduisent que quelques éléments (sur 12 cartes année / 125 bulletins réels de l'année au moment de la capture, dont seuls 2 bulletins d'août + 2 bulletins de janvier non mockés) — une reconstruction fidèle des classes/attributs/structure observés en direct, pas un dump complet de chaque page.
