# Source réelle — prefecture-16 (Charente)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle** : `https://www.charente.gouv.fr/Publications/Recueil-des-actes-administratifs2`

Note : l'URL avec casse majuscule (`Recueil-des-Actes-Administratifs2`, notée le 2026-08-13) redirige côté serveur (HTTP 301, vérifié par `curl -I`) vers cette même URL en casse minuscule — déjà celle enregistrée dans `registre-sources.yaml`, aucune correction nécessaire ici (contrairement à prefecture-15 dont le `point_acces` initial pointait vers la casse qui redirige).

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- **Structure de la page de l'année, la seule vraiment nouvelle parmi les 18 connecteurs à ce jour** : PAS de `.fr-card` ni de `.fr-downloads-group` — un simple bloc de texte enrichi (`.fr-text--lead`, contenu WYSIWYG copié-collé) où les en-têtes de mois sont encapsulés dans des `<i><b>` imbriqués sans structure list/heading exploitable, et chaque bulletin est un `<p><a class="fr-link" href="...">` — 223 liens pour l'année 2026 au moment de la capture, en ordre chronologique **décroissant**, aucune pagination (toute l'année sur une seule page).
- Chaque lien de la liste **ne pointe PAS directement vers un PDF** : vérifié par `curl -I` que l'URL cible (`/Media/Files/Publications/.../recueil-16-2026-231-recueil-des-actes-administratifs`, sans extension) répond `Content-Type: text/html`, pas `application/pdf` — c'est une page de DÉTAIL HTML, comme prefecture-02/05/77 (`page_detail`).
- Sur la page de détail, le vrai lien PDF est présent via `<a class="fr-link fr-link--download" href="...pdf">`, avec une classe **INTACTE** (pas de bug `id=` comme sur 05/07/08/09/11/12/14) — vérifié sur 3 pages de détail distinctes (231, 230, 001 — la plus récente, une intermédiaire, et la plus ancienne de l'année).
- `selecteur_publications` (`.fr-text--lead a.fr-link`) scope explicitement le bloc de contenu principal : la page compte 231 liens `a.fr-link` au total, dont seulement 223 sous `.fr-text--lead` — les ~8 autres (nav, partage) sont exclus par ce scope.
- Texte du lien ("Recueil des actes administratifs n° 16-2026-231 du 13 août 2026") : ne contient jamais de mot-clé rave/teknival.
- Nom de page de détail reprenant directement une numérotation séquentielle globale exploitable (`16-2026-{num}`), utilisée pour choisir le numéro de référence des PDF synthétiques.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 16-2026-08-231`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-16.yaml`), mais la formulation exacte d'un vrai bulletin RAA de la Charente reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-16.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → année → page de détail par publication → PDF → scan de contenu), pas la formulation exacte du texte réglementaire.
