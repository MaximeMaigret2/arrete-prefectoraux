# Source réelle — prefecture-06 (Alpes-Maritimes)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine — contrairement aux connecteurs précédents, cette capture n'a pas nécessité d'inspection Chrome manuelle ni de round-trip via la machine de l'opérateur).

**URL réelle** : `https://www.alpes-maritimes.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA`

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- Chaque année mène à une page listant une carte par mois (href se terminant par `/Aout-2026`).
- Chaque page de mois liste les bulletins en PLATE (`.fr-card`), même lien `.fr-card__title a` porte le titre et l'URL PDF directe (pas de page de détail intermédiaire, comme prefecture-01/13).
- La page de mois est PAGINÉE (10 par page) mais en ordre chronologique **DÉCROISSANT** : la page 1 (offset 0) contient déjà les bulletins les plus récents (13/08 → 05/08/2026, vérifié par les dates dans l'attribut `title`), la page 2 (offset 10) contient les plus anciens (04/08, 03/08/2026). Contrairement à prefecture-02/05 (ordre croissant, nécessitant un saut vers la dernière page), **aucune étape de navigation supplémentaire n'est nécessaire ici** — la page 1 suffit.
- Texte du lien (`"Recueil 277-2026-06"`) : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site (la page HTML liste des bulletins réels, mais leur contenu PDF n'a pas été ouvert). Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 06-2026-08-277`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-06.yaml`), mais la formulation exacte d'un vrai bulletin RAA des Alpes-Maritimes reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-06.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation année → mois → PDF direct → scan de contenu, page déjà en ordre décroissant), pas la formulation exacte du texte réglementaire.
