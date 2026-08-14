# Source réelle — prefecture-07 (Ardèche)

**Capturé le** : 2026-08-14, par `fetch` direct (accès réseau sortant disponible depuis le sandbox cloud vers ce domaine).

**URL réelle** : `https://www.ardeche.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- Chaque année mène à une page listant une carte par mois — **sans suffixe d'année dans l'URL du mois** (`/RAA-2026/Aout`, pas `/Aout-2026`, à la différence de prefecture-06/01) ; seuls les mois déjà écoulés sont présents (8 cartes en date de capture, pas 12).
- Chaque page de mois liste les bulletins en PLATE (`.fr-downloads-group ul li`), non paginée (9 bulletins pour août 2026, tous sur une seule page).
- **Bug de markup réel confirmé sur les 9 liens de la page d'août** : `<a id= class="fr-link fr-link--download" href="...">` — `id` vide immédiatement suivi d'un espace puis `class=...`, qui casse l'attribut `class` pour tout parseur HTML conforme (même bug que celui documenté pour prefecture-05). `selecteur_titre`/`selecteur_lien_pdf` de `prefecture-07.yaml` ciblent donc `a[href$='.pdf']`, insensibles à ce bug.
- Texte du lien (`"Télécharger recueil-07-2026-249-recueil-du 05 août 2026 special-1"`) : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 07-2026-08-249`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-07.yaml`), mais la formulation exacte d'un vrai bulletin RAA de l'Ardèche reste à confirmer avant mise en production.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-07.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation année → mois → liste plate `fr-downloads-group` → PDF direct par `href` en contournant le bug `class` → scan de contenu), pas la formulation exacte du texte réglementaire.
